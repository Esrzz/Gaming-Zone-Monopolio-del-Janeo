import type { GameEvent } from '../engine'
import { CHANCE_CARDS, CHEST_CARDS } from '../engine/cards'
import type { SfxName } from './sfx'

/** ¿La carta le da plata al jugador desde el banco? (no emite evento de pago propio) */
export function cardPaysPlayer(deck: 'chance' | 'chest', cardId: string): boolean {
  const card = (deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS).find((c) => c.id === cardId)
  return card?.effect.kind === 'collectFromBank'
}

/** ¿La carta es una mala noticia? (suena el efecto "neg" al darla vuelta) */
export function isNegativeCard(deck: 'chance' | 'chest', cardId: string): boolean {
  const card = (deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS).find((c) => c.id === cardId)
  if (!card) return false
  const e = card.effect
  return (
    e.kind === 'goToJail' ||
    e.kind === 'payBank' ||
    e.kind === 'payPlayers' ||
    e.kind === 'repairs' ||
    (e.kind === 'moveRelative' && e.steps < 0)
  )
}

/**
 * Efecto de sonido de un evento (los de cartas, dados y movimiento se manejan aparte).
 * `viewer` es el jugador que está mirando: si te pagan suena "cobrar", si pagás suena "pagar".
 */
export function sfxForEvent(e: GameEvent, viewer: string): SfxName | null {
  switch (e.type) {
    case 'bought':
    case 'built':
      return 'Cardbought'
    case 'sold-house':
    case 'mortgaged':
      return 'moneycollected'
    case 'unmortgaged':
      return 'moneypaid'
    case 'jailed':
      return 'Jail'
    case 'bankrupt':
      return 'Lose'
    case 'won':
      return 'Victory'
    case 'jackpot':
      return 'moneycollected'
    case 'paid': // el alquiler también emite 'paid', por eso 'rent' no suena aparte
      return e.to === viewer ? 'moneycollected' : 'moneypaid'
    default:
      return null
  }
}
