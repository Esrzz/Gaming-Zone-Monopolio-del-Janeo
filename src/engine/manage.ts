import { BOARD, groupPositions, priceOf } from './board'
import { mortgageFee } from './trade'
import type { Action, GameEvent, GameState } from './types'

/** 5 casas = hotel. */
export const HOTEL = 5

export type ManageAction = Extract<Action, { type: 'build' | 'sellHouse' | 'mortgage' | 'unmortgage' }>

export const isManageAction = (a: Action): a is ManageAction =>
  a.type === 'build' || a.type === 'sellHouse' || a.type === 'mortgage' || a.type === 'unmortgage'

/** Valor que da el banco al hipotecar (la mitad del precio). */
export const mortgageValue = (pos: number): number => Math.floor(priceOf(BOARD[pos]) / 2)

/** Lo que cuesta levantar la hipoteca: su valor más el 10% de interés. */
export const unmortgageCost = (pos: number): number => mortgageValue(pos) + mortgageFee(pos)

/** Lo que paga el banco al vender una casa (la mitad de lo que costó). */
export const sellValue = (pos: number): number => {
  const t = BOARD[pos]
  return t.kind === 'property' ? Math.floor(t.houseCost / 2) : 0
}

/** Casas y hoteles que ya están en el tablero (el resto está en el banco). */
export function buildingsInUse(s: GameState): { houses: number; hotels: number } {
  let houses = 0
  let hotels = 0
  for (const o of Object.values(s.owned)) {
    if (o.houses === HOTEL) hotels++
    else houses += o.houses
  }
  return { houses, hotels }
}

const groupOf = (pos: number) => {
  const t = BOARD[pos]
  return t.kind === 'property' ? groupPositions(t.group) : []
}

/** Motivo por el que NO se puede construir en `pos` (null = se puede). */
export function whyNotBuild(s: GameState, playerId: string, pos: number): string | null {
  const t = BOARD[pos]
  const o = s.owned[pos]
  const me = s.players.find((p) => p.id === playerId)
  if (!me || me.bankrupt) return 'Jugador inválido'
  if (t?.kind !== 'property') return 'Solo se construye en propiedades de color'
  if (!o || o.owner !== playerId) return 'No es tuya'
  const group = groupOf(pos)
  if (!group.every((p) => s.owned[p]?.owner === playerId)) return 'Necesitás todo el barrio'
  if (group.some((p) => s.owned[p].mortgaged)) return 'Hay una propiedad hipotecada en el barrio'
  if (o.houses >= HOTEL) return 'Ya tiene hotel'
  if (group.some((p) => s.owned[p].houses < o.houses)) return 'Construí parejo: primero las demás del barrio'
  if (me.cash < t.houseCost) return `Te faltan $${t.houseCost - me.cash}`
  const used = buildingsInUse(s)
  if (o.houses === HOTEL - 1) {
    if (used.hotels >= s.rules.hotelsTotal) return 'No quedan hoteles en el banco'
  } else if (used.houses >= s.rules.housesTotal) return 'No quedan casas en el banco'
  return null
}

/** Motivo por el que NO se puede vender una casa u hotel de `pos`. */
export function whyNotSell(s: GameState, playerId: string, pos: number): string | null {
  const t = BOARD[pos]
  const o = s.owned[pos]
  if (t?.kind !== 'property' || !o || o.owner !== playerId) return 'No es tuya'
  if (o.houses === 0) return 'No tiene casas'
  if (groupOf(pos).some((p) => s.owned[p].houses > o.houses)) return 'Vendé parejo: primero las que tienen más'
  if (o.houses === HOTEL && buildingsInUse(s).houses + 4 > s.rules.housesTotal) return 'No hay 4 casas en el banco para reemplazar el hotel'
  return null
}

export function whyNotMortgage(s: GameState, playerId: string, pos: number): string | null {
  const t = BOARD[pos]
  const o = s.owned[pos]
  if (!t || !('price' in t) || !o || o.owner !== playerId) return 'No es tuya'
  if (o.mortgaged) return 'Ya está hipotecada'
  if (t.kind === 'property' && groupOf(pos).some((p) => s.owned[p]?.houses > 0)) return 'Vendé las casas del barrio primero'
  return null
}

export function whyNotUnmortgage(s: GameState, playerId: string, pos: number): string | null {
  const o = s.owned[pos]
  const me = s.players.find((p) => p.id === playerId)
  if (!me || !o || o.owner !== playerId) return 'No es tuya'
  if (!o.mortgaged) return 'No está hipotecada'
  if (me.cash < unmortgageCost(pos)) return `Te faltan $${unmortgageCost(pos) - me.cash}`
  return null
}

/**
 * Construir, vender casas e hipotecar: solo en tu turno (antes o después de tirar).
 * Devuelve un mensaje de error, o null si se aplicó sobre `s`.
 */
export function applyManageAction(s: GameState, ev: GameEvent[], action: ManageAction): string | null {
  if (s.players[s.current].id !== action.player) return 'Solo podés gestionar tus propiedades en tu turno'
  const me = s.players.find((p) => p.id === action.player)!
  const pos = action.tile
  if (!Number.isInteger(pos) || !BOARD[pos]) return 'Casilla inválida'
  const o = s.owned[pos]

  switch (action.type) {
    case 'build': {
      const why = whyNotBuild(s, me.id, pos)
      if (why) return why
      const t = BOARD[pos]
      if (t.kind !== 'property') return 'Casilla inválida'
      me.cash -= t.houseCost
      o.houses += 1
      ev.push({ type: 'built', player: me.id, tile: pos, houses: o.houses, cost: t.houseCost })
      return null
    }
    case 'sellHouse': {
      const why = whyNotSell(s, me.id, pos)
      if (why) return why
      const refund = sellValue(pos)
      me.cash += refund
      o.houses -= 1
      ev.push({ type: 'sold-house', player: me.id, tile: pos, houses: o.houses, amount: refund })
      return null
    }
    case 'mortgage': {
      const why = whyNotMortgage(s, me.id, pos)
      if (why) return why
      const amount = mortgageValue(pos)
      me.cash += amount
      o.mortgaged = true
      ev.push({ type: 'mortgaged', player: me.id, tile: pos, amount })
      return null
    }
    case 'unmortgage': {
      const why = whyNotUnmortgage(s, me.id, pos)
      if (why) return why
      const cost = unmortgageCost(pos)
      me.cash -= cost
      o.mortgaged = false
      ev.push({ type: 'unmortgaged', player: me.id, tile: pos, cost })
      return null
    }
  }
}
