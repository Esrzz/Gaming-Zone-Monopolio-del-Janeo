import ranking from '../data/ranking.json'
import type { GroupId, RentTable, Tile } from './types'

export const BOARD_SIZE = 40
export const JAIL_POSITION = 10

/** Casillas de calles (22), de la más barata a la más cara. */
const STREET_SLOTS: { pos: number; group: GroupId; price: number; rent: RentTable; houseCost: number }[] = [
  { pos: 1, group: 'brown', price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50 },
  { pos: 3, group: 'brown', price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50 },
  { pos: 6, group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
  { pos: 8, group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
  { pos: 9, group: 'lightblue', price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50 },
  { pos: 11, group: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
  { pos: 13, group: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
  { pos: 14, group: 'pink', price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100 },
  { pos: 16, group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
  { pos: 18, group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
  { pos: 19, group: 'orange', price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100 },
  { pos: 21, group: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
  { pos: 23, group: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
  { pos: 24, group: 'red', price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150 },
  { pos: 26, group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
  { pos: 27, group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
  { pos: 29, group: 'yellow', price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150 },
  { pos: 31, group: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
  { pos: 32, group: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
  { pos: 34, group: 'green', price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200 },
  { pos: 37, group: 'darkblue', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200 },
  { pos: 39, group: 'darkblue', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200 },
]

/**
 * Los juegos más jugados del server (ver scripts/ranking.mjs) ocupan las calles más caras:
 * el #1 va en la casilla 39 (la más cara) y el #22 en la casilla 1 (la más barata).
 */
const STREET_GAMES = ranking.slice(0, STREET_SLOTS.length)

const platform = (name: string, icon: string): Tile => ({ kind: 'platform', name, price: 200, icon })
const utility = (name: string, icon: string): Tile => ({ kind: 'utility', name, price: 150, icon })

const FIXED: Record<number, Tile> =  {
  0: { kind: 'go', name: 'Salida' },
  2: { kind: 'chest', name: 'Arcas del discord' },
  4: { kind: 'tax', name: 'Impuesto a las ganancias', amount: 200 },
  // Plataformas vinculadas a servicios externos (los íconos se pueden reemplazar en public/icons/)
  5: platform('YouTube', '/icons/youtube.svg'),
  7: { kind: 'chance', name: 'Suerte' },
  10: { kind: 'jail', name: 'Cárcel' },
  12: utility('Mute', '/icons/mic-off.svg'),
  15: platform('Spotify', '/icons/spotify.svg'),
  17: { kind: 'chest', name: 'Arcas del discord' },
  20: { kind: 'parking', name: 'Estacionamiento libre'},
  22: { kind: 'chance', name: 'Suerte' },
  25: platform('Twitch', '/icons/twitch.svg'),
  28: utility('Deafen', '/icons/headphones-off.svg'),
  30: { kind: 'gotojail', name: 'Banneo' },
  33: { kind: 'chest', name: 'Arcas del discord' },
  35: platform('Steam', '/icons/steam.svg'),
  36: { kind: 'chance', name: 'Suerte' },
  38: { kind: 'tax', name: 'Impuesto al carreo', amount: 100 },
}

export const BOARD: Tile[] = Array.from({ length: BOARD_SIZE }, (_, i): Tile => {
  const fixed = FIXED[i]
  if (fixed) return fixed
  const slot = STREET_SLOTS.findIndex((s) => s.pos === i)
  const { group, price, rent, houseCost } = STREET_SLOTS[slot]
  // slot 0 = casilla más barata = juego menos jugado de los 22
  const game = STREET_GAMES[STREET_SLOTS.length - 1 - slot]
  return { kind: 'property', name: game.name, group, price, rent, houseCost, icon: game.icon }
})

export function isBuyable(tile: Tile): boolean {
  return tile.kind === 'property' || tile.kind === 'platform' || tile.kind === 'utility'
}

export function priceOf(tile: Tile): number {
  return isBuyable(tile) ? (tile as { price: number }).price : 0
}

/** Posiciones de las casillas de un grupo de color. */
export function groupPositions(group: GroupId): number[] {
  return BOARD.flatMap((t, i) => (t.kind === 'property' && t.group === group ? [i] : []))
}

export function positionsOfKind(kind: 'platform' | 'utility'): number[] {
  return BOARD.flatMap((t, i) => (t.kind === kind ? [i] : []))
}
