import { BOARD } from '../engine'
import type { GameEvent } from '../engine'

const money = (n: number) => `$${n}`

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
      return `${name(e.player)} cayó en ${e.deck === 'chance' ? 'Suerte' : 'Arca comunal'}`
    case 'card-drawn':
      return `🃏 ${name(e.player)}: "${e.text}"`
    case 'bankrupt':
      return `${name(e.player)} quebró${e.creditor ? `: sus bienes pasan a ${name(e.creditor)}` : ''}`
    case 'turn':
      return `Turno de ${name(e.player)}`
    case 'won':
      return `¡${name(e.player)} ganó la partida!`
  }
}
