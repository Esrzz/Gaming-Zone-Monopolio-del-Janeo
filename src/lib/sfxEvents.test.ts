import { describe, expect, it } from 'vitest'
import { sfxForEvent } from './sfxEvents'
import { moneyChanges } from './moneyFx'
import { DEFAULT_RULES } from '../engine'

describe('subasta: sonido y plata gastada', () => {
  const won = { type: 'auctionWon', player: 'a', tile: 3, amount: 120 } as const
  it('al ganar suena como una compra', () => {
    expect(sfxForEvent(won, 'a')).toBe('Cardbought')
    expect(sfxForEvent(won, 'b')).toBe('Cardbought')
  })
  it('muestra el gasto flotante del ganador', () => {
    expect(moneyChanges(won, DEFAULT_RULES)).toEqual([{ player: 'a', amount: -120 }])
  })
  it('si nadie ofrece no suena nada', () => {
    expect(sfxForEvent({ type: 'auctionUnsold', tile: 3 }, 'a')).toBeNull()
  })
})
