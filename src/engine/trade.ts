import { BOARD, boardOf, groupPositions, isBuyable, priceOf } from './board'
import type { Action, GameEvent, GameState, PlayerState, TradeOffer, TradeSide } from './types'

/** Interés que paga quien recibe una propiedad hipotecada (sobre el valor de la hipoteca). */
export const MORTGAGE_INTEREST = 0.1

export const emptySide = (): TradeSide => ({ cash: 0, properties: [], jailCards: 0 })

export const mortgageFee = (pos: number): number => Math.ceil((priceOf(BOARD[pos]) / 2) * MORTGAGE_INTEREST)

/**
 * Una propiedad se puede intercambiar si es de alguien y ni ella ni las de su grupo de color tienen
 * casas u hoteles (hay que venderlos antes).
 */
export function isTradable(s: GameState, pos: number): boolean {
  const tile = BOARD[pos]
  if (!tile || !isBuyable(tile) || !s.owned[pos]) return false
  if (tile.kind === 'property') return groupPositions(tile.group).every((p) => (s.owned[p]?.houses ?? 0) === 0)
  return true
}

const isMoney = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0

const isEmpty = (side: TradeSide) => side.cash === 0 && side.properties.length === 0 && side.jailCards === 0

const fees = (s: GameState, receiving: number[]) =>
  receiving.reduce((sum, pos) => sum + (s.owned[pos]?.mortgaged ? mortgageFee(pos) : 0), 0)

/** Devuelve el motivo por el que la oferta no es válida, o null si se puede hacer. */
export function validateTrade(s: GameState, t: TradeOffer): string | null {
  const from = s.players.find((p) => p.id === t.from)
  const to = s.players.find((p) => p.id === t.to)
  if (!from || !to || from.bankrupt || to.bankrupt) return 'Jugador inválido'
  if (from.id === to.id) return 'No podés intercambiar con vos mismo'

  for (const side of [t.give, t.get]) {
    if (!isMoney(side.cash) || !isMoney(side.jailCards)) return 'Montos inválidos'
    if (new Set(side.properties).size !== side.properties.length) return 'Propiedades repetidas'
  }
  if (isEmpty(t.give) && isEmpty(t.get)) return 'La oferta está vacía'

  for (const pos of t.give.properties) {
    if (s.owned[pos]?.owner !== from.id) return `${boardOf(s)[pos]?.name ?? 'Esa casilla'} no es de ${from.name}`
    if (!isTradable(s, pos)) return `${boardOf(s)[pos].name} tiene casas en su grupo: hay que venderlas antes`
  }
  for (const pos of t.get.properties) {
    if (s.owned[pos]?.owner !== to.id) return `${boardOf(s)[pos]?.name ?? 'Esa casilla'} no es de ${to.name}`
    if (!isTradable(s, pos)) return `${boardOf(s)[pos].name} tiene casas en su grupo: hay que venderlas antes`
  }

  if (t.give.jailCards > from.jailCards) return `${from.name} no tiene tantas cartas de salida`
  if (t.get.jailCards > to.jailCards) return `${to.name} no tiene tantas cartas de salida`
  if (t.give.cash > from.cash) return `${from.name} no tiene esa plata`
  if (t.get.cash > to.cash) return `${to.name} no tiene esa plata`

  // Quien recibe una propiedad hipotecada paga el interés al banco: tiene que poder pagarlo.
  if (from.cash - t.give.cash + t.get.cash - fees(s, t.get.properties) < 0) return `${from.name} no llega a pagar el interés de la hipoteca`
  if (to.cash - t.get.cash + t.give.cash - fees(s, t.give.properties) < 0) return `${to.name} no llega a pagar el interés de la hipoteca`
  return null
}

function executeTrade(s: GameState, ev: GameEvent[], t: TradeOffer) {
  const from = s.players.find((p) => p.id === t.from)!
  const to = s.players.find((p) => p.id === t.to)!

  from.cash += t.get.cash - t.give.cash
  to.cash += t.give.cash - t.get.cash
  from.jailCards += t.get.jailCards - t.give.jailCards
  to.jailCards += t.give.jailCards - t.get.jailCards

  const payFee = (p: PlayerState, positions: number[]) => {
    const amount = fees(s, positions)
    if (amount > 0) {
      p.cash -= amount
      ev.push({ type: 'paid', from: p.id, to: 'bank', amount })
    }
  }
  payFee(from, t.get.properties)
  payFee(to, t.give.properties)

  for (const pos of t.give.properties) s.owned[pos].owner = to.id
  for (const pos of t.get.properties) s.owned[pos].owner = from.id
}

const involves = (t: TradeOffer, id: string) => t.from === id || t.to === id

/** Cierra la oferta abierta si involucra a `playerId` (por ejemplo, si quebró). */
export function cancelTradeOf(s: GameState, ev: GameEvent[], playerId: string) {
  if (s.trade && involves(s.trade, playerId)) {
    ev.push({ type: 'trade-cancelled', trade: s.trade })
    s.trade = null
  }
}

type TradeAction = Extract<Action, { type: 'proposeTrade' | 'acceptTrade' | 'rejectTrade' | 'cancelTrade' }>

export const isTradeAction = (a: Action): a is TradeAction =>
  a.type === 'proposeTrade' || a.type === 'acceptTrade' || a.type === 'rejectTrade' || a.type === 'cancelTrade'

/**
 * Proponer un intercambio solo se puede en tu turno (antes o después de tirar, hasta que lo termines);
 * responderlo (aceptar/rechazar) puede hacerlo quien lo recibe en cualquier momento.
 * Devuelve un mensaje de error, o null si la acción se aplicó sobre `s`.
 */
export function applyTradeAction(s: GameState, ev: GameEvent[], action: TradeAction): string | null {
  switch (action.type) {
    case 'proposeTrade': {
      if (s.players[s.current].id !== action.player) return 'Solo podés ofrecer intercambios en tu turno (hasta que lo termines)'
      if (s.trade) return 'Ya hay una oferta abierta: respondela o cancelala primero'
      const offer: TradeOffer = {
        from: action.player,
        to: action.to,
        give: structuredClone(action.give),
        get: structuredClone(action.get),
      }
      const error = validateTrade(s, offer)
      if (error) return error
      s.trade = offer
      ev.push({ type: 'trade-proposed', trade: offer })
      return null
    }
    case 'acceptTrade': {
      const t = s.trade
      if (!t) return 'No hay ninguna oferta abierta'
      if (t.to !== action.player) return 'Solo quien recibe la oferta puede aceptarla'
      const error = validateTrade(s, t)
      if (error) return error
      executeTrade(s, ev, t)
      s.trade = null
      ev.push({ type: 'trade-accepted', trade: t })
      return null
    }
    case 'rejectTrade': {
      const t = s.trade
      if (!t) return 'No hay ninguna oferta abierta'
      if (t.to !== action.player) return 'Solo quien recibe la oferta puede rechazarla'
      s.trade = null
      ev.push({ type: 'trade-rejected', trade: t })
      return null
    }
    case 'cancelTrade': {
      const t = s.trade
      if (!t) return 'No hay ninguna oferta abierta'
      if (t.from !== action.player) return 'Solo quien hizo la oferta puede cancelarla'
      s.trade = null
      ev.push({ type: 'trade-cancelled', trade: t })
      return null
    }
  }
}
