import { BOARD } from '../engine'
import { GROUP_COLORS } from './layout'

/** Color del puntito de una propiedad: el del barrio, blanco para servicios y gris para plataformas. */
export function tileDot(pos: number): string {
  const t = BOARD[pos]
  if (t.kind === 'property') return GROUP_COLORS[t.group]
  if (t.kind === 'utility') return '#ffffff'
  if (t.kind === 'platform') return '#9ca3af'
  return 'transparent'
}
