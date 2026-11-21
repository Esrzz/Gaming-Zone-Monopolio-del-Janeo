import { describe, expect, it } from 'vitest'
import { gridCell, sideOf, tileCenter } from './layout'

describe('layout del tablero', () => {
  it('cada posición ocupa una celda distinta del borde', () => {
    const cells = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const { row, col } = gridCell(i)
      expect(row === 1 || row === 11 || col === 1 || col === 11).toBe(true)
      cells.add(`${row},${col}`)
    }
    expect(cells.size).toBe(40)
  })

  it('las esquinas están donde corresponde', () => {
    expect(gridCell(0)).toEqual({ row: 11, col: 11 })
    expect(gridCell(10)).toEqual({ row: 11, col: 1 })
    expect(gridCell(20)).toEqual({ row: 1, col: 1 })
    expect(gridCell(30)).toEqual({ row: 1, col: 11 })
  })

  it('lados', () => {
    expect(sideOf(5)).toBe('bottom')
    expect(sideOf(15)).toBe('left')
    expect(sideOf(25)).toBe('top')
    expect(sideOf(35)).toBe('right')
    expect(sideOf(30)).toBe('corner')
  })

  it('los centros quedan dentro del tablero y la salida abajo a la derecha', () => {
    const c = tileCenter(0)
    expect(c.x).toBeGreaterThan(90)
    expect(c.y).toBeGreaterThan(90)
    for (let i = 0; i < 40; i++) {
      const t = tileCenter(i)
      expect(t.x).toBeGreaterThan(0)
      expect(t.x).toBeLessThan(100)
    }
  })
})
