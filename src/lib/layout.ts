import type { GroupId } from '../engine'

/** Columnas/filas del tablero: las esquinas son 1.5 veces más grandes que el resto. */
const SIZES = [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5]
const TOTAL = SIZES.reduce((a, b) => a + b, 0)

export type Side = 'bottom' | 'left' | 'top' | 'right' | 'corner'

/** Celda (1-based) de cada posición, dando la vuelta al tablero en sentido horario desde abajo a la derecha. */
export function gridCell(pos: number): { row: number; col: number } {
  if (pos <= 10) return { row: 11, col: 11 - pos }
  if (pos <= 20) return { row: 21 - pos, col: 1 }
  if (pos <= 30) return { row: 1, col: pos - 19 }
  return { row: pos - 29, col: 11 }
}

export function sideOf(pos: number): Side {
  if (pos % 10 === 0) return 'corner'
  if (pos < 10) return 'bottom'
  if (pos < 20) return 'left'
  if (pos < 30) return 'top'
  return 'right'
}

const centerOf = (index: number) => {
  const before = SIZES.slice(0, index - 1).reduce((a, b) => a + b, 0)
  return ((before + SIZES[index - 1] / 2) / TOTAL) * 100
}

/** Centro de la casilla en porcentaje del tablero. */
export function tileCenter(pos: number): { x: number; y: number } {
  const { row, col } = gridCell(pos)
  return { x: centerOf(col), y: centerOf(row) }
}

export const GRID_TEMPLATE = SIZES.map((s) => `${s}fr`).join(' ')

export const GROUP_COLORS: Record<GroupId, string> = {
  brown: '#8b5a3c',
  lightblue: '#7dd3fc',
  pink: '#f472b6',
  orange: '#fb923c',
  red: '#ef4444',
  yellow: '#facc15',
  green: '#22c55e',
  darkblue: '#3b5bdb',
}

export const PLAYER_COLORS = ['#8b5cf6', '#ff4fd8', '#35e8e0', '#3ddc84', '#f5b83d', '#f0524f']

/** Diámetro de las fichas en % del ancho del tablero (el tablero es cuadrado). */
export const TOKEN_SIZE = 3.8

/**
 * Posición de la ficha número `index` (de `count`) dentro de una casilla: se acomodan en una grilla
 * que aprovecha el ancho y alto de la casilla, así nunca quedan una encima de otra (hasta 6 jugadores).
 * Devuelve el centro en % del tablero.
 */
export function tokenSlot(pos: number, index: number, count: number, size = TOKEN_SIZE): { x: number; y: number } {
  const { row, col } = gridCell(pos)
  const unit = 100 / TOTAL
  const w = SIZES[col - 1] * unit
  const h = SIZES[row - 1] * unit
  const c = tileCenter(pos)
  const gap = size * 1.06
  const perRow = Math.max(1, Math.floor(w / gap))
  const rows = Math.ceil(count / perRow)
  const stepY = rows > 1 ? Math.min(gap, (h - size) / (rows - 1)) : 0
  const r = Math.floor(index / perRow)
  const inRow = r === rows - 1 ? count - r * perRow : perRow
  const k = index - r * perRow
  return {
    x: c.x + (k - (inRow - 1) / 2) * gap,
    y: c.y + (r - (rows - 1) / 2) * stepY,
  }
}
