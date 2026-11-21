import { BOARD, BOARD_SIZE, JAIL_POSITION, groupPositions, isBuyable, positionsOfKind, priceOf } from './board'
import { CHANCE_CARDS, CHEST_CARDS } from './cards'
import type { Action, Card, GameEvent, GameState, Phase, PlayerId, PlayerState, Result, Rules } from './types'
import { applyTradeAction, cancelTradeOf, isTradeAction } from './trade'

export const DEFAULT_RULES: Rules = {
  startingCash: 1500,
  goSalary: 200,
  jailFine: 50,
  maxJailTurns: 3,
  doublesToJail: 3,
  fullSetMultiplier: 3,
  platformRent: [50, 100, 150, 200],
  freeParkingJackpot: false,
}

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6

/** Baraja 0..n-1 (Fisher-Yates). `random` se puede inyectar para partidas reproducibles (servidor, tests). */
export function shuffledOrder(n: number, random: () => number = Math.random): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Carta que está en la posición `index` del mazo ya barajado de esta partida. */
function cardAt(s: GameState, deck: 'chance' | 'chest', index: number) {
  const cards = deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS
  const order = deck === 'chance' ? s.chanceOrder : s.chestOrder
  return cards[order[((index % order.length) + order.length) % order.length]]
}

/**
 * `random` decide el orden de los mazos de cartas. El estado guarda el orden resultante, así que
 * después `applyAction` sigue siendo determinista: el servidor puede barajar una vez al crear la partida.
 */
export function createGame(
  players: { id: PlayerId; name: string }[],
  rules: Partial<Rules> = {},
  random: () => number = Math.random,
): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`La partida necesita entre ${MIN_PLAYERS} y ${MAX_PLAYERS} jugadores`)
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error('Jugadores repetidos')
  const r: Rules = { ...DEFAULT_RULES, ...rules }
  return {
    rules: r,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      cash: r.startingCash,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: 0,
      bankrupt: false,
    })),
    owned: {},
    current: 0,
    phase: 'roll',
    doubles: 0,
    rollAgain: false,
    lastDice: null,
    pot: 0,
    winner: null,
    pendingCard: null,
    chanceOrder: shuffledOrder(CHANCE_CARDS.length, random),
    chestOrder: shuffledOrder(CHEST_CARDS.length, random),
    chanceIndex: 0,
    chestIndex: 0,
    trade: null,
  }
}

export function currentPlayer(s: GameState): PlayerState {
  return s.players[s.current]
}

/** Alquiler que debería pagar quien cae en `position` (0 si es libre, propia o hipotecada). */
export function computeRent(s: GameState, position: number): number {
  const tile = BOARD[position]
  const o = s.owned[position]
  if (!o || o.mortgaged) return 0
  const ownedBy = (pos: number) => s.owned[pos]?.owner === o.owner

  if (tile.kind === 'property') {
    if (o.houses > 0) return tile.rent[o.houses]
    const full = groupPositions(tile.group).every(ownedBy)
    return full ? tile.rent[0] * s.rules.fullSetMultiplier : tile.rent[0]
  }
  if (tile.kind === 'platform') {
    const n = positionsOfKind('platform').filter(ownedBy).length
    const table = s.rules.platformRent
    return table[Math.min(n, table.length) - 1]
  }
  if (tile.kind === 'utility') {
    const n = positionsOfKind('utility').filter(ownedBy).length
    const sum = s.lastDice ? s.lastDice[0] + s.lastDice[1] : 0
    return sum * (n >= 2 ? 10 : 4)
  }
  return 0
}

const fail = (error: string): Result => ({ ok: false, error })

export function applyAction(prev: GameState, action: Action): Result {
  if (prev.phase === 'over') return fail('La partida ya terminó')
  const s: GameState = structuredClone(prev)
  const ev: GameEvent[] = []
  const me = s.players.find((p) => p.id === action.player)
  if (!me || me.bankrupt) return fail('Jugador inválido')

  // Declararse en bancarrota se puede en cualquier momento, aunque no sea tu turno.
  if (action.type === 'bankrupt') {
    goBankrupt(s, ev, me, null)
    return { ok: true, state: s, events: ev }
  }

  // Los intercambios se responden en cualquier momento; proponerlos solo se puede en tu turno (ver trade.ts).
  if (isTradeAction(action)) {
    const error = applyTradeAction(s, ev, action)
    return error ? fail(error) : { ok: true, state: s, events: ev }
  }

  if (currentPlayer(s).id !== action.player) return fail('No es tu turno')

  switch (action.type) {
    case 'roll': {
      if (s.phase !== 'roll') return fail('Ahora no se puede tirar')
      const [a, b] = action.dice
      if (![a, b].every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) return fail('Dados inválidos')
      s.lastDice = [a, b]
      ev.push({ type: 'rolled', player: me.id, dice: [a, b] })
      const dbl = a === b

      if (me.inJail) {
        s.rollAgain = false
        if (dbl) {
          leaveJail(me, ev, 'doubles')
        } else {
          me.jailTurns += 1
          if (me.jailTurns < s.rules.maxJailTurns) {
            s.phase = 'end'
            return { ok: true, state: s, events: ev }
          }
          if (!pay(s, ev, me, s.rules.jailFine, null)) return { ok: true, state: s, events: ev }
          leaveJail(me, ev, 'forced')
        }
      } else if (dbl) {
        s.doubles += 1
        if (s.doubles >= s.rules.doublesToJail) {
          sendToJail(s, ev, me)
          s.phase = 'end'
          return { ok: true, state: s, events: ev }
        }
        s.rollAgain = true
      } else {
        s.rollAgain = false
      }

      move(s, ev, me, a + b)
      resolveLanding(s, ev, me)
      if (!me.bankrupt && (s.phase as Phase) !== 'buy' && (s.phase as Phase) !== 'card') settle(s)
      break
    }

    case 'buy': {
      if (s.phase !== 'buy') return fail('No hay nada para comprar')
      const tile = BOARD[me.position]
      const price = priceOf(tile)
      if (me.cash < price) return fail('No te alcanza la plata')
      me.cash -= price
      s.owned[me.position] = { owner: me.id, mortgaged: false, houses: 0 }
      ev.push({ type: 'bought', player: me.id, tile: me.position, price })
      settle(s)
      break
    }

    case 'decline': {
      // TODO: acá va la subasta obligatoria cuando esté implementada.
      if (s.phase !== 'buy') return fail('No hay nada para rechazar')
      ev.push({ type: 'declined', player: me.id, tile: me.position })
      settle(s)
      break
    }

    case 'endTurn': {
      if (s.phase !== 'end') return fail('Todavía no podés terminar el turno')
      nextTurn(s, ev)
      break
    }

    case 'payJailFine': {
      if (s.phase !== 'roll' || !me.inJail) return fail('No estás en la cárcel o no es el momento')
      if (me.cash < s.rules.jailFine) return fail('No te alcanza la plata')
      pay(s, ev, me, s.rules.jailFine, null)
      leaveJail(me, ev, 'fine')
      break
    }

    case 'useJailCard': {
      if (s.phase !== 'roll' || !me.inJail) return fail('No estás en la cárcel o no es el momento')
      if (me.jailCards < 1) return fail('No tenés carta de salida')
      me.jailCards -= 1
      leaveJail(me, ev, 'card')
      break
    }

    case 'drawCard': {
      if (s.phase !== 'card' || !s.pendingCard) return fail('No hay carta para robar')
      const { deck, cardId } = s.pendingCard
      const card = cardAt(s, deck, (deck === 'chance' ? s.chanceIndex : s.chestIndex) - 1)
      if (card.id !== cardId) return fail('Carta inválida')

      ev.push({ type: 'card-drawn', player: me.id, deck, cardId: card.id, text: card.text })
      s.pendingCard = null

      applyCardEffect(s, ev, me, card.effect)

      if (!me.bankrupt && (s.phase as Phase) !== 'buy' && (s.phase as Phase) !== 'over') settle(s)
      break
    }
  }

  return { ok: true, state: s, events: ev }
}

// ---------------------------------------------------------------------------

function applyCardEffect(
  s: GameState,
  ev: GameEvent[],
  p: PlayerState,
  effect: Card['effect'],
) {
  switch (effect.kind) {
    case 'collectFromBank': {
      p.cash += effect.amount
      break
    }
    case 'payBank': {
      pay(s, ev, p, effect.amount, null)
      break
    }
    case 'collectFromPlayers': {
      let collected = 0
      for (const other of s.players) {
        if (other.id === p.id || other.bankrupt) continue
        const actual = Math.min(other.cash, effect.amount)
        other.cash -= actual
        collected += actual
        ev.push({ type: 'paid', from: other.id, to: p.id, amount: actual })
      }
      p.cash += collected
      break
    }
    case 'payPlayers': {
      for (const other of s.players) {
        if (other.id === p.id || other.bankrupt) continue
        if (!pay(s, ev, p, effect.amount, other)) return // quebró pagando
      }
      break
    }
    case 'move': {
      const from = p.position
      const to = effect.to
      const passedGo = to < from && to !== 0
      if (passedGo || to === 0) p.cash += s.rules.goSalary
      p.position = to
      ev.push({ type: 'moved', player: p.id, from, to, steps: (to - from + BOARD_SIZE) % BOARD_SIZE, passedGo: passedGo || to === 0 })
      resolveLanding(s, ev, p)
      break
    }
    case 'moveRelative': {
      const from = p.position
      const raw = from + effect.steps
      const to = ((raw % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE
      const passedGo = effect.steps > 0 && raw >= BOARD_SIZE
      if (passedGo) p.cash += s.rules.goSalary
      p.position = to
      ev.push({ type: 'moved', player: p.id, from, to, steps: effect.steps, passedGo })
      resolveLanding(s, ev, p)
      break
    }
    case 'moveToNearest': {
      const positions = positionsOfKind(effect.tileKind)
      const from = p.position
      // Encuentra la siguiente posición del tipo indicado en sentido horario
      const next =
        positions.find((pos) => pos > from) ??
        positions[0] // da la vuelta
      const passedGo = next <= from
      if (passedGo) p.cash += s.rules.goSalary
      p.position = next
      ev.push({ type: 'moved', player: p.id, from, to: next, steps: (next - from + BOARD_SIZE) % BOARD_SIZE, passedGo })
      // Si la casilla tiene dueño, el alquiler es el doble para plataformas o 10x para servicios
      resolveLandingWithBonus(s, ev, p, effect.tileKind)
      break
    }
    case 'goToJail': {
      sendToJail(s, ev, p)
      break
    }
    case 'getOutOfJail': {
      p.jailCards += 1
      break
    }
    case 'repairs': {
      let total = 0
      for (const o of Object.values(s.owned)) {
        if (o.owner !== p.id) continue
        total += o.houses < 5 ? o.houses * effect.houseCost : effect.hotelCost
      }
      if (total > 0) pay(s, ev, p, total, null)
      break
    }
  }
}

// ---------------------------------------------------------------------------

function leaveJail(p: PlayerState, ev: GameEvent[], how: 'doubles' | 'fine' | 'card' | 'forced') {
  p.inJail = false
  p.jailTurns = 0
  ev.push({ type: 'left-jail', player: p.id, how })
}

function sendToJail(s: GameState, ev: GameEvent[], p: PlayerState) {
  p.position = JAIL_POSITION
  p.inJail = true
  p.jailTurns = 0
  s.rollAgain = false
  s.doubles = 0
  ev.push({ type: 'jailed', player: p.id })
}

function move(s: GameState, ev: GameEvent[], p: PlayerState, steps: number) {
  const from = p.position
  const raw = from + steps
  const passedGo = raw >= BOARD_SIZE
  p.position = raw % BOARD_SIZE
  if (passedGo) p.cash += s.rules.goSalary
  ev.push({ type: 'moved', player: p.id, from, to: p.position, steps, passedGo })
}

function resolveLanding(s: GameState, ev: GameEvent[], p: PlayerState) {
  resolveLandingWithBonus(s, ev, p, null)
}

function resolveLandingWithBonus(
  s: GameState,
  ev: GameEvent[],
  p: PlayerState,
  nearestKind: 'platform' | 'utility' | null,
) {
  const tile = BOARD[p.position]
  if (isBuyable(tile)) {
    const o = s.owned[p.position]
    if (!o) {
      s.phase = 'buy'
      return
    }
    if (o.owner === p.id || o.mortgaged) return
    const owner = s.players.find((x) => x.id === o.owner)!
    let amount = computeRent(s, p.position)
    // Carta "más cercana": duplica alquiler de plataforma o fuerza 10x en servicio
    if (nearestKind === 'platform') amount *= 2
    if (nearestKind === 'utility') {
      // Recalcula con factor 10x independientemente de cuántas tenga el dueño
      const sum = s.lastDice ? s.lastDice[0] + s.lastDice[1] : 0
      amount = sum * 10
    }
    ev.push({ type: 'rent', from: p.id, to: owner.id, tile: p.position, amount })
    pay(s, ev, p, amount, owner)
    return
  }
  switch (tile.kind) {
    case 'tax':
      pay(s, ev, p, tile.amount, null)
      break
    case 'gotojail':
      sendToJail(s, ev, p)
      break
    case 'parking':
      if (s.rules.freeParkingJackpot && s.pot > 0) {
        p.cash += s.pot
        ev.push({ type: 'jackpot', player: p.id, amount: s.pot })
        s.pot = 0
      }
      break
    case 'chance': {
      const card = cardAt(s, 'chance', s.chanceIndex)
      s.chanceIndex += 1
      s.pendingCard = { deck: 'chance', cardId: card.id }
      s.phase = 'card'
      ev.push({ type: 'card-pending', player: p.id, deck: 'chance' })
      break
    }
    case 'chest': {
      const card = cardAt(s, 'chest', s.chestIndex)
      s.chestIndex += 1
      s.pendingCard = { deck: 'chest', cardId: card.id }
      s.phase = 'card'
      ev.push({ type: 'card-pending', player: p.id, deck: 'chest' })
      break
    }
  }
}

/** Después de resolver la casilla: tirar de nuevo (dobles) o terminar el turno. */
function settle(s: GameState) {
  s.phase = s.rollAgain ? 'roll' : 'end'
}

/**
 * Cobra `amount`. Si no alcanza la plata, el jugador quiebra (cuando existan hipotecas y ventas
 * de casas, acá va la fase de "juntar plata" antes de quebrar). Devuelve false si quebró.
 */
function pay(s: GameState, ev: GameEvent[], from: PlayerState, amount: number, to: PlayerState | null): boolean {
  if (from.cash >= amount) {
    from.cash -= amount
    const toPot = !to && s.rules.freeParkingJackpot
    if (to) to.cash += amount
    else if (toPot) s.pot += amount
    ev.push({ type: 'paid', from: from.id, to: to ? to.id : toPot ? 'pot' : 'bank', amount })
    return true
  }
  goBankrupt(s, ev, from, to)
  return false
}

function goBankrupt(s: GameState, ev: GameEvent[], p: PlayerState, creditor: PlayerState | null) {
  const wasCurrent = currentPlayer(s).id === p.id
  if (creditor) creditor.cash += p.cash
  p.cash = 0
  p.bankrupt = true
  p.inJail = false
  for (const [pos, o] of Object.entries(s.owned)) {
    if (o.owner !== p.id) continue
    if (creditor) s.owned[Number(pos)] = { ...o, owner: creditor.id }
    else delete s.owned[Number(pos)]
  }
  if (creditor) creditor.jailCards += p.jailCards
  p.jailCards = 0
  ev.push({ type: 'bankrupt', player: p.id, creditor: creditor?.id ?? null })
  cancelTradeOf(s, ev, p.id)

  const alive = s.players.filter((x) => !x.bankrupt)
  if (alive.length === 1) {
    s.winner = alive[0].id
    s.phase = 'over'
    ev.push({ type: 'won', player: alive[0].id })
  } else if (wasCurrent) {
    nextTurn(s, ev)
  }
}

function nextTurn(s: GameState, ev: GameEvent[]) {
  do {
    s.current = (s.current + 1) % s.players.length
  } while (currentPlayer(s).bankrupt)
  s.phase = 'roll'
  s.doubles = 0
  s.rollAgain = false
  s.pendingCard = null
  ev.push({ type: 'turn', player: currentPlayer(s).id })
}
