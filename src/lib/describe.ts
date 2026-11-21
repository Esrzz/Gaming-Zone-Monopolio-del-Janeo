import { BOARD } from '../engine'
import type { GameEvent, TradeSide } from '../engine'

const money = (n: number) => `$${n}`

/** "$200, ROB RUN y una carta de salida" (o "nada" si el lado está vacío) */
export function describeSide(side: TradeSide): string {
  const parts = [
    ...(side.cash > 0 ? [money(side.cash)] : []),
    ...side.properties.map((p) => BOARD[p].name),
    ...(side.jailCards > 0 ? [side.jailCards === 1 ? 'una carta de salida' : `${side.jailCards} cartas de salida`] : []),
  ]
  if (parts.length === 0) return 'nada'
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

/** Texto en español para el registro de la partida. Devuelve null si el evento no merece línea. */
export function describeEvent(e: GameEvent, name: (id: string) => string): string | null {
  switch (e.type) {
    case 'rolled':
      return `${name(e.player)} sacó ${e.dice[0]} y ${e.dice[1]}`
    case 'moved':
      return `${name(e.player)} avanzó a ${BOARD[e.to].name}${e.passedGo ? ' y cobró la salida' : ''}`
    case 'bought':
      return `${name(e.player)} compró ${BOARD[e.tile].name} por ${money(e.price)}`
    case 'declined':
      return `${name(e.player)} no compró ${BOARD[e.tile].name}`
    case 'rent':
      return `${name(e.from)} pagó ${money(e.amount)} de alquiler a ${name(e.to)}`
    case 'paid':
      if (e.to === 'bank') return `${name(e.from)} pagó ${money(e.amount)} al banco`
      if (e.to === 'pot') return `${name(e.from)} puso ${money(e.amount)} en el pozo`
      return null
    case 'jackpot':
      return `${name(e.player)} se llevó el pozo: ${money(e.amount)}`
    case 'jailed':
      return `${name(e.player)} va a la cárcel`
    case 'left-jail': {
      const how = { doubles: 'sacando dobles', fine: 'pagando la multa', card: 'con una carta', forced: 'pagando la multa obligatoria' }
      return `${name(e.player)} salió de la cárcel ${how[e.how]}`
    }
    case 'card-pending':
      return `${name(e.player)} cayó en ${e.deck === 'chance' ? 'Suerte' : 'Arcas del discord'}`
    case 'card-drawn':
      return `🃏 ${name(e.player)}: "${e.text}"`
    case 'trade-proposed':
      return `🤝 ${name(e.trade.from)} le ofrece a ${name(e.trade.to)}: ${describeSide(e.trade.give)} a cambio de ${describeSide(e.trade.get)}`
    case 'trade-accepted':
      return `✅ ${name(e.trade.to)} aceptó el intercambio con ${name(e.trade.from)}`
    case 'trade-rejected':
      return `❌ ${name(e.trade.to)} rechazó la oferta de ${name(e.trade.from)}`
    case 'trade-cancelled':
      return `${name(e.trade.from)} retiró su oferta a ${name(e.trade.to)}`
    case 'bankrupt':
      return `${name(e.player)} quebró${e.creditor ? `: sus bienes pasan a ${name(e.creditor)}` : ''}`
    case 'turn':
      return `Turno de ${name(e.player)}`
    case 'won':
      return `¡${name(e.player)} ganó la partida!`
  }
}
