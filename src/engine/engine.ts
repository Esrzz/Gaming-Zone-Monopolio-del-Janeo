import { BOARD, BOARD_SIZE, DEFAULT_GAMES, JAIL_POSITION, groupPositions, isBuyable, positionsOfKind, priceOf } from './board'
import { sanitizeGames } from './ranking'
import { CHANCE_CARDS, CHEST_CARDS } from './cards'
import type { Action, Card, DeckName, GameEvent, GameInfo, GameState, Phase, PlayerId, PlayerState, Result, Rules } from './types'
import { applyManageAction, isManageAction, liquidValue } from './manage'
import { applyTradeAction, cancelTradeOf, isTradeAction } from './trade'

export const DEFAULT_RULES: Rules = {
  startingCash: 1500,
  goSalary: 200,
  jailFine: 50,
  maxJailTurns: 3,
  doublesToJail: 3,
  fullSetMultiplier: 3,
  platformRent: [50, 100, 150, 200],
  housesTotal: 32,
  hotelsTotal: 12,
  freeParkingJackpot: false,
  turnSeconds: 240,
}

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6

/** Generador de azar con semilla (mulberry32): mismo número de semilla, misma secuencia. */
export function seededRandom(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let x = Math.imul(t ^ (t >>> 15), t | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** Siguiente número al azar del motor; avanza `s.rng`, así el estado sigue siendo 100% determinista. */
function rngNext(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0
  let x = Math.imul(s.rng ^ (s.rng >>> 15), s.rng | 1)
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296
}

/** Baraja una copia de la lista (Fisher-Yates). */
function shuffled<T>(list: T[], random: () => number): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const CARDS: Record<DeckName, Card[]> = { chance: CHANCE_CARDS, chest: CHEST_CARDS }

const cardById = (deck: DeckName, id: string): Card | undefined => CARDS[deck].find((c) => c.id === id)

/**
 * `random` puede ser una semilla (número) o una función que devuelve números en [0, 1): decide el orden
 * inicial de los mazos y la semilla del azar del motor. Con la misma semilla la partida es reproducible.
 */
export function createGame(
  players: { id: PlayerId; name: string }[],
  rules: Partial<Rules> = {},
  random: number | (() => number) = Math.random,
  games?: GameInfo[],
  opts: { order?: boolean } = {},
): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`La partida necesita entre ${MIN_PLAYERS} y ${MAX_PLAYERS} jugadores`)
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error('Jugadores repetidos')
  const rand = typeof random === 'number' ? seededRandom(random) : random
  const r: Rules = sanitizeRules(rules)
  return {
    games: sanitizeGames(games ?? DEFAULT_GAMES),
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
    phase: opts.order ? 'order' : 'roll',
    order: opts.order ? { ranks: [players.map((p) => p.id)], queue: players.map((p) => p.id), rolls: {}, round: 1 } : null,
    doubles: 0,
    rollAgain: false,
    lastDice: null,
    pot: 0,
    winner: null,
    pendingCard: null,
    decks: {
      chance: { draw: shuffled(CHANCE_CARDS.map((c) => c.id), rand), discard: [] },
      chest: { draw: shuffled(CHEST_CARDS.map((c) => c.id), rand), discard: [] },
    },
    rng: Math.floor(rand() * 4294967296) >>> 0,
    seq: 0,
    debts: [],
    trade: null,
    auction: null,
  }
}

/** Completa y acota las reglas (el servidor las usa con lo que manda el host antes de crear la partida). */
export function sanitizeRules(input: Partial<Rules> = {}): Rules {
  const r: Rules = { ...DEFAULT_RULES, ...input }
  const int = (v: number, min: number, max: number, def: number) =>
    Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def
  r.startingCash = int(r.startingCash, 100, 100000, DEFAULT_RULES.startingCash)
  r.goSalary = int(r.goSalary, 0, 5000, DEFAULT_RULES.goSalary)
  r.jailFine = int(r.jailFine, 0, 5000, DEFAULT_RULES.jailFine)
  r.maxJailTurns = int(r.maxJailTurns, 1, 10, DEFAULT_RULES.maxJailTurns)
  r.doublesToJail = int(r.doublesToJail, 2, 10, DEFAULT_RULES.doublesToJail)
  r.fullSetMultiplier = int(r.fullSetMultiplier, 1, 10, DEFAULT_RULES.fullSetMultiplier)
  r.housesTotal = int(r.housesTotal, 0, 200, DEFAULT_RULES.housesTotal)
  r.hotelsTotal = int(r.hotelsTotal, 0, 100, DEFAULT_RULES.hotelsTotal)
  r.platformRent =
    Array.isArray(r.platformRent) && r.platformRent.length === 4 && r.platformRent.every((n) => Number.isFinite(n) && n >= 0)
      ? r.platformRent.map((n) => Math.round(n))
      : [...DEFAULT_RULES.platformRent]
  r.freeParkingJackpot = !!r.freeParkingJackpot
  r.turnSeconds = int(r.turnSeconds, 15, 1800, DEFAULT_RULES.turnSeconds)
  return r
}

/** Estado que se le puede mandar a los clientes: sin el orden de los mazos ni la semilla del azar. */
export function toPublicState(s: GameState): GameState {
  const hide = (d: { draw: string[]; discard: string[] }) => ({ draw: d.draw.map(() => ''), discard: [...d.discard] })
  return { ...s, rng: 0, decks: { chance: hide(s.decks.chance), chest: hide(s.decks.chest) } }
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

export interface ApplyOptions {
  /**
   * Si es false, se rechazan las tiradas con dados que manda el cliente (`roll.dice`): el motor tira con su propio
   * azar. El servidor del multijugador SIEMPRE tiene que usar false; el modo de prueba usa el valor por defecto (true).
   */
  clientDice?: boolean
}

/** Acciones que solo puede mandar el servidor (nunca un cliente). */
export const isServerOnly = (a: Action): boolean => a.type === 'abandon' || a.type === 'closeAuction'

/** Acciones que no se pueden hacer mientras haya deudas pendientes. */
const BLOCKED_BY_DEBT = new Set<Action['type']>(['roll', 'buy', 'decline', 'endTurn', 'payJailFine', 'useJailCard', 'drawCard'])

export function applyAction(prev: GameState, action: Action, opts: ApplyOptions = {}): Result {
  if (prev.phase === 'over') return fail('La partida ya terminó')
  const s: GameState = structuredClone(prev)
  const ev: GameEvent[] = []
  const me = s.players.find((p) => p.id === action.player)
  if (!me || me.bankrupt) return fail('Jugador inválido')

  const done = (): Result => {
    settleDebts(s, ev)
    s.seq += 1
    return { ok: true, state: s, events: ev }
  }

  // Declararse en bancarrota se puede en cualquier momento, aunque no sea tu turno.
  // Si tenés una deuda, tus bienes le pasan a quien se la debés.
  if (action.type === 'bankrupt') {
    const debt = s.debts.find((d) => d.from === me.id)
    const creditor = debt && debt.to !== 'bank' ? s.players.find((p) => p.id === debt.to) ?? null : null
    goBankrupt(s, ev, me, creditor && !creditor.bankrupt ? creditor : null)
    return done()
  }

  // El servidor la manda cuando un jugador se desconecta y no vuelve: sus bienes vuelven al banco.
  if (action.type === 'abandon') {
    goBankrupt(s, ev, me, null)
    return done()
  }

  // Mientras se define el orden de salida no se puede hacer nada más que tirar (ni intercambiar ni construir)
  if (s.phase === 'order' && action.type !== 'orderRoll') return fail('Todavía se está definiendo el orden de salida')

  // Subasta abierta: la puede jugar cualquiera (en su turno o no) y no se puede hacer nada más hasta que cierre
  if (s.auction) {
    if (action.type !== 'bid' && action.type !== 'passAuction' && action.type !== 'closeAuction') {
      return fail('Hay una subasta en curso: ofrecé, retirate o esperá a que termine')
    }
    const error = applyAuctionAction(s, ev, me, action)
    return error ? fail(error) : done()
  }
  if (action.type === 'bid' || action.type === 'passAuction' || action.type === 'closeAuction') return fail('No hay ninguna subasta abierta')

  // Los intercambios se responden en cualquier momento; proponerlos solo se puede en tu turno (ver trade.ts).
  if (isTradeAction(action)) {
    const error = applyTradeAction(s, ev, action)
    return error ? fail(error) : done()
  }

  // Construir e hipotecar: solo en tu turno (ver manage.ts)
  if (isManageAction(action)) {
    const error = applyManageAction(s, ev, action)
    return error ? fail(error) : done()
  }

  if (BLOCKED_BY_DEBT.has(action.type) && s.debts.length > 0) {
    const d = s.debts[0]
    return fail(`Primero tenés que saldar la deuda de $${d.amount}: vendé casas, hipotecá o declarate en bancarrota`)
  }

  if (currentPlayer(s).id !== action.player) return fail('No es tu turno')

  switch (action.type) {
    case 'orderRoll': {
      const o = s.order
      if (s.phase !== 'order' || !o) return fail('Ahora no se tira para el orden de salida')
      if (action.dice && opts.clientDice === false) return fail('Los dados los tira el servidor')
      const [a, b] = action.dice ?? [Math.floor(rngNext(s) * 6) + 1, Math.floor(rngNext(s) * 6) + 1]
      if (![a, b].every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) return fail('Dados inválidos')
      o.rolls[me.id] = [a, b]
      o.queue.shift()
      s.lastDice = [a, b]
      ev.push({ type: 'orderRolled', player: me.id, dice: [a, b], round: o.round })
      advanceOrder(s, ev)
      break
    }

    case 'roll': {
      if (s.phase !== 'roll') return fail('Ahora no se puede tirar')
      if (action.dice && opts.clientDice === false) return fail('Los dados los tira el servidor')
      const [a, b] = action.dice ?? [Math.floor(rngNext(s) * 6) + 1, Math.floor(rngNext(s) * 6) + 1]
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
            return done()
          }
          if (!pay(s, ev, me, s.rules.jailFine, null)) return done()
          leaveJail(me, ev, 'forced')
        }
      } else if (dbl) {
        s.doubles += 1
        if (s.doubles >= s.rules.doublesToJail) {
          sendToJail(s, ev, me)
          s.phase = 'end'
          return done()
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
      if (s.phase !== 'buy') return fail('No hay nada para rechazar')
      ev.push({ type: 'declined', player: me.id, tile: me.position })
      // Un intercambio abierto no puede convivir con la subasta (nadie lo podría responder): se cierra
      if (s.trade) cancelTradeOf(s, ev, s.trade.from)
      // Subasta obligatoria: la propiedad se la queda el que más ofrezca (la fase sigue en 'buy' hasta que cierre)
      s.auction = { tile: me.position, bid: 0, leader: null, passed: [] }
      ev.push({ type: 'auctionStarted', tile: me.position })
      checkAuction(s, ev)
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
      returnJailCard(s)
      leaveJail(me, ev, 'card')
      break
    }

    case 'drawCard': {
      if (s.phase !== 'card' || !s.pendingCard) return fail('No hay carta para robar')
      const { deck, cardId } = s.pendingCard
      const card = cardById(deck, cardId)
      if (!card) return fail('Carta inválida')

      ev.push({ type: 'card-drawn', player: me.id, deck, cardId: card.id, text: card.text })
      s.pendingCard = null

      applyCardEffect(s, ev, me, card.effect)
      // La carta usada va al descarte (la "salí libre" se queda con quien la tiene hasta que la use)
      if (card.effect.kind !== 'getOutOfJail') s.decks[deck].discard.push(card.id)

      // Si la carta te llevó a otra casilla de carta, esa queda pendiente (fase 'card'): no hay que pasar de fase
      if (!me.bankrupt && !s.pendingCard && (s.phase as Phase) !== 'buy' && (s.phase as Phase) !== 'over') settle(s)
      break
    }
  }

  return done()
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
      s.pendingCard = { deck: 'chance', cardId: drawFromDeck(s, 'chance') }
      s.phase = 'card'
      ev.push({ type: 'card-pending', player: p.id, deck: 'chance' })
      break
    }
    case 'chest': {
      s.pendingCard = { deck: 'chest', cardId: drawFromDeck(s, 'chest') }
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
 * Cobra `amount`. Si no alcanza la plata pero vendiendo casas e hipotecando se podría juntar, queda una deuda
 * pendiente (ver `Debt`) y la partida espera; si ni liquidando todo alcanza, el jugador quiebra.
 * Devuelve false solo si quebró.
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
  if (liquidValue(s, from.id) >= amount) {
    s.debts.push({ from: from.id, to: to ? to.id : 'bank', amount })
    ev.push({ type: 'debt', from: from.id, to: to ? to.id : 'bank', amount })
    return true
  }
  goBankrupt(s, ev, from, to)
  return false
}

/** Paga las deudas pendientes apenas el deudor tiene la plata (después de vender, hipotecar o intercambiar). */
function settleDebts(s: GameState, ev: GameEvent[]) {
  let progressed = true
  while (progressed && s.debts.length > 0) {
    progressed = false
    for (let i = 0; i < s.debts.length; i++) {
      const d = s.debts[i]
      const debtor = s.players.find((p) => p.id === d.from)!
      if (debtor.cash < d.amount) continue
      s.debts.splice(i, 1)
      const to = d.to === 'bank' ? null : s.players.find((p) => p.id === d.to) ?? null
      pay(s, ev, debtor, d.amount, to && !to.bankrupt ? to : null)
      progressed = true
      break
    }
  }
}

/** Roba la carta de arriba del mazo; si se acabó, vuelve a barajar el descarte. */
function drawFromDeck(s: GameState, name: DeckName): string {
  const deck = s.decks[name]
  if (deck.draw.length === 0) {
    deck.draw = shuffled(deck.discard, () => rngNext(s))
    deck.discard = []
  }
  return deck.draw.shift()!
}

/** Cuando se usa una carta de "salí libre de la cárcel", vuelve al mazo del que salió. */
function returnJailCard(s: GameState) {
  for (const name of ['chance', 'chest'] as DeckName[]) {
    const missing = CARDS[name].find(
      (c) =>
        c.effect.kind === 'getOutOfJail' &&
        !s.decks[name].draw.includes(c.id) &&
        !s.decks[name].discard.includes(c.id) &&
        s.pendingCard?.cardId !== c.id,
    )
    if (missing) {
      s.decks[name].discard.push(missing.id)
      return
    }
  }
}

/** Ofrecer, retirarse o cerrar (por tiempo) la subasta abierta. Devuelve un error o null si se aplicó. */
function applyAuctionAction(s: GameState, ev: GameEvent[], me: PlayerState, action: Action): string | null {
  const a = s.auction!
  if (action.type === 'closeAuction') {
    finishAuction(s, ev)
    return null
  }
  if (a.passed.includes(me.id)) return 'Ya te retiraste de esta subasta'
  if (action.type === 'passAuction') {
    if (a.leader === me.id) return 'Tenés la oferta más alta: no podés retirarte'
    a.passed.push(me.id)
    checkAuction(s, ev)
    return null
  }
  if (action.type !== 'bid') return 'Acción inválida'
  if (a.leader === me.id) return 'Ya tenés la oferta más alta'
  if (!Number.isInteger(action.amount) || action.amount <= a.bid) return `Tenés que ofrecer más de $${a.bid}`
  if (action.amount > me.cash) return 'No te alcanza la plata (en una subasta solo cuenta la plata en mano)'
  a.bid = action.amount
  a.leader = me.id
  ev.push({ type: 'bid', player: me.id, amount: action.amount })
  checkAuction(s, ev)
  return null
}

/** Cierra la subasta si ya no queda nadie que pueda superar la oferta (los que no llegan se retiran solos). */
function checkAuction(s: GameState, ev: GameEvent[]) {
  const a = s.auction
  if (!a) return
  const alive = s.players.filter((p) => !p.bankrupt)
  for (const p of alive) {
    if (p.id !== a.leader && !a.passed.includes(p.id) && p.cash <= a.bid) a.passed.push(p.id)
  }
  if (alive.every((p) => p.id === a.leader || a.passed.includes(p.id))) finishAuction(s, ev)
}

function finishAuction(s: GameState, ev: GameEvent[]) {
  const a = s.auction
  if (!a) return
  const winner = a.leader ? s.players.find((p) => p.id === a.leader && !p.bankrupt && p.cash >= a.bid) : null
  if (winner) {
    winner.cash -= a.bid
    s.owned[a.tile] = { owner: winner.id, mortgaged: false, houses: 0 }
    ev.push({ type: 'auctionWon', player: winner.id, tile: a.tile, amount: a.bid })
  } else {
    ev.push({ type: 'auctionUnsold', tile: a.tile })
  }
  s.auction = null
  // si el turno sigue siendo el de quien rechazó la compra, continúa (tirar de nuevo o terminar)
  if (s.phase === 'buy') settle(s)
}

function goBankrupt(s: GameState, ev: GameEvent[], p: PlayerState, creditor: PlayerState | null) {
  const wasCurrent = currentPlayer(s).id === p.id
  const heldJail = p.jailCards
  if (creditor) creditor.cash += p.cash
  p.cash = 0
  p.bankrupt = true
  p.inJail = false
  for (const [pos, o] of Object.entries(s.owned)) {
    if (o.owner !== p.id) continue
    // Las casas y hoteles vuelven al banco; las propiedades pasan al acreedor (o al banco)
    if (creditor) s.owned[Number(pos)] = { ...o, owner: creditor.id, houses: 0 }
    else delete s.owned[Number(pos)]
  }
  if (creditor) creditor.jailCards += p.jailCards
  p.jailCards = 0
  // Las deudas del quebrado desaparecen; las que le debían a él pasan al banco
  s.debts = s.debts.filter((d) => d.from !== p.id).map((d) => (d.to === p.id ? { ...d, to: 'bank' as const } : d))
  // Las cartas de salida de la cárcel que tenía vuelven a su mazo si no se las lleva un acreedor
  if (!creditor) for (let i = 0; i < heldJail; i++) returnJailCard(s)
  ev.push({ type: 'bankrupt', player: p.id, creditor: creditor?.id ?? null })
  cancelTradeOf(s, ev, p.id)

  if (s.auction && s.auction.leader === p.id) {
    s.auction.leader = null
    s.auction.bid = 0
  }
  const alive = s.players.filter((x) => !x.bankrupt)
  if (alive.length === 1) {
    s.auction = null
    s.winner = alive[0].id
    s.phase = 'over'
    ev.push({ type: 'won', player: alive[0].id })
  } else if (s.phase === 'order') {
    dropFromOrder(s, ev, p.id)
  } else if (wasCurrent) {
    nextTurn(s, ev)
  }
  checkAuction(s, ev)
}

/** El que tira ahora en la fase `order` es el primero de la cola. */
function pointAtQueueHead(s: GameState) {
  const head = s.order?.queue[0]
  if (head) s.current = Math.max(0, s.players.findIndex((p) => p.id === head))
}

/**
 * Terminó la cola de una ronda: se separan los jugadores por lo que sacaron (mayor suma primero). Si quedan grupos
 * empatados, tiran de nuevo solo ellos; si no, queda definido el orden y empieza el primer turno.
 */
function advanceOrder(s: GameState, ev: GameEvent[]) {
  const o = s.order
  if (!o) return
  if (o.queue.length > 0) return pointAtQueueHead(s)

  const idx = o.ranks.findIndex((g) => g.length > 0 && g.every((id) => id in o.rolls))
  if (idx >= 0) {
    const sum = (id: string) => o.rolls[id][0] + o.rolls[id][1]
    const sums = [...new Set(o.ranks[idx].map(sum))].sort((x, y) => y - x)
    // dentro de cada grupo se mantiene el orden de llegada al lobby
    o.ranks.splice(idx, 1, ...sums.map((v) => o.ranks[idx].filter((id) => sum(id) === v)))
  }
  o.ranks = o.ranks.filter((g) => g.length > 0)

  const tied = o.ranks.find((g) => g.length > 1)
  if (tied) {
    o.round += 1
    o.rolls = {}
    o.queue = s.players.map((p) => p.id).filter((id) => tied.includes(id))
    ev.push({ type: 'orderTie', players: [...o.queue], round: o.round })
    return pointAtQueueHead(s)
  }

  const order = o.ranks.flat()
  const byId = new Map(s.players.map((p) => [p.id, p]))
  s.players = [...order.map((id) => byId.get(id)!), ...s.players.filter((p) => !order.includes(p.id))]
  s.order = null
  s.phase = 'roll'
  s.current = 0
  s.doubles = 0
  s.rollAgain = false
  ev.push({ type: 'orderSet', order })
  ev.push({ type: 'turn', player: currentPlayer(s).id })
}

/** Alguien se fue (o quebró) mientras se definía el orden: sale de la cola y de los grupos. */
function dropFromOrder(s: GameState, ev: GameEvent[], id: PlayerId) {
  const o = s.order
  if (!o) return
  o.queue = o.queue.filter((x) => x !== id)
  o.ranks = o.ranks.map((g) => g.filter((x) => x !== id)).filter((g) => g.length > 0)
  delete o.rolls[id]
  advanceOrder(s, ev)
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

/**
 * Qué hacer cuando se acaba el tiempo (turno o respuesta a una oferta). El servidor aplica la acción que devuelve
 * (o el modo de prueba, para mostrarla animada). null si no hay nada que hacer.
 */
export function timeoutAction(s: GameState): Action | null {
  if (s.phase === 'over') return null
  if (s.trade) return { type: 'rejectTrade', player: s.trade.to }
  const p = currentPlayer(s)
  if (s.auction) return { type: 'closeAuction', player: p.id }
  if (s.phase === 'order') return { type: 'orderRoll', player: p.id }
  if (s.debts.some((d) => d.from === p.id)) return { type: 'bankrupt', player: p.id }
  switch (s.phase) {
    case 'roll':
      return { type: 'roll', player: p.id }
    case 'buy':
      return { type: 'decline', player: p.id }
    case 'card':
      return { type: 'drawCard', player: p.id }
    case 'end':
      return { type: 'endTurn', player: p.id }
  }
  return null
}
