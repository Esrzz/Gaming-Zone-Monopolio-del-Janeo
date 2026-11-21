import { describe, expect, it } from 'vitest'
import { applyAction, computeRent, createGame } from './engine'
import { buildingsInUse, sellValue, unmortgageCost } from './manage'
import type { Action, GameState } from './types'

const A = 'a'
const B = 'b'
const newGame = () =>
  createGame([
    { id: A, name: 'Ana' },
    { id: B, name: 'Beto' },
  ], {}, () => 0.999999) // sin mezclar los mazos: tests deterministas

const own = (s: GameState, positions: number[], owner: string, extra: Partial<{ houses: number; mortgaged: boolean }> = {}): GameState => {
  const c = structuredClone(s)
  for (const p of positions) c.owned[p] = { owner, mortgaged: false, houses: 0, ...extra }
  return c
}
const run = (s: GameState, a: Action): GameState => {
  const r = applyAction(s, a)
  if (!r.ok) throw new Error(r.error)
  return r.state
}
const err = (s: GameState, a: Action) => {
  const r = applyAction(s, a)
  return r.ok ? null : r.error
}
const build = (tile: number, player = A): Action => ({ type: 'build', player, tile })
const cash = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.cash

// Marrón: casillas 1 y 3 (casa $50, alquiler 2/10/30/90/160/250 y 4/20/60/180/320/450)
describe('construir', () => {
  it('construye una casa, cobra el costo y sube el alquiler', () => {
    let s = own(newGame(), [1, 3], A)
    s = run(s, build(1))
    expect(s.owned[1].houses).toBe(1)
    expect(cash(s, A)).toBe(1450)
    expect(computeRent(s, 1)).toBe(10)
  })

  it('exige tener todo el barrio', () => {
    const s = own(own(newGame(), [1], A), [3], B)
    expect(err(s, build(1))).toMatch(/todo el barrio/)
  })

  it('construye parejo: no se pone una 2ª casa antes de que las demás tengan una', () => {
    let s = own(newGame(), [1, 3], A)
    s = run(s, build(1))
    expect(err(s, build(1))).toMatch(/parejo/)
    s = run(s, build(3))
    s = run(s, build(1))
    expect(s.owned[1].houses).toBe(2)
  })

  it('con 4 casas el siguiente es el hotel (cuenta como 5) y no se puede pasar de ahí', () => {
    let s = own(newGame(), [1, 3], A, { houses: 4 })
    s = run(s, build(1))
    expect(s.owned[1].houses).toBe(5)
    expect(computeRent(s, 1)).toBe(250)
    s = run(s, build(3))
    expect(err(s, build(1))).toMatch(/hotel/)
  })

  it('no alcanza la plata o no hay turno', () => {
    let s = own(newGame(), [1, 3], A)
    s = { ...s, players: s.players.map((p) => (p.id === A ? { ...p, cash: 40 } : p)) }
    expect(err(s, build(1))).toMatch(/faltan \$10/)
    expect(err(own(newGame(), [1, 3], B), build(1, B))).toMatch(/tu turno/)
  })

  it('el banco tiene casas limitadas', () => {
    let s = own(newGame(), [1, 3], A)
    s = { ...s, rules: { ...s.rules, housesTotal: 1 } }
    s = run(s, build(1))
    expect(err(s, build(3))).toMatch(/No quedan casas/)
  })

  it('no construye si una del barrio está hipotecada, ni en plataformas', () => {
    let s = own(newGame(), [1, 3], A)
    s.owned[3].mortgaged = true
    expect(err(s, build(1))).toMatch(/hipotecada/)
    expect(err(own(newGame(), [5], A), build(5))).toMatch(/color/)
  })
})

describe('vender casas', () => {
  it('devuelve la mitad y respeta el orden parejo', () => {
    let s = own(newGame(), [1, 3], A, { houses: 2 })
    s.owned[3].houses = 1
    expect(err(s, { type: 'sellHouse', player: A, tile: 3 })).toMatch(/parejo|casas/i)
    s = run(s, { type: 'sellHouse', player: A, tile: 1 })
    expect(s.owned[1].houses).toBe(1)
    expect(cash(s, A)).toBe(1500 + sellValue(1))
    expect(sellValue(1)).toBe(25)
  })

  it('un hotel pasa a 4 casas', () => {
    let s = own(newGame(), [1, 3], A, { houses: 5 })
    s = run(s, { type: 'sellHouse', player: A, tile: 1 })
    expect(s.owned[1].houses).toBe(4)
  })

  it('cuenta casas y hoteles en uso', () => {
    const s = own(own(newGame(), [1], A, { houses: 3 }), [3], A, { houses: 5 })
    expect(buildingsInUse(s)).toEqual({ houses: 3, hotels: 1 })
  })
})

describe('hipotecas', () => {
  it('hipotecar da la mitad del precio y deja el alquiler en 0', () => {
    let s = own(newGame(), [1, 3], A)
    s = run(s, { type: 'mortgage', player: A, tile: 1 })
    expect(s.owned[1].mortgaged).toBe(true)
    expect(cash(s, A)).toBe(1530)
    expect(computeRent(s, 1)).toBe(0)
  })

  it('no se hipoteca con casas en el barrio', () => {
    const s = own(newGame(), [1, 3], A, { houses: 1 })
    expect(err(s, { type: 'mortgage', player: A, tile: 1 })).toMatch(/casas/)
  })

  it('levantar la hipoteca cuesta la mitad más 10%', () => {
    let s = own(newGame(), [1, 3], A)
    s = run(s, { type: 'mortgage', player: A, tile: 1 })
    expect(unmortgageCost(1)).toBe(33)
    s = run(s, { type: 'unmortgage', player: A, tile: 1 })
    expect(s.owned[1].mortgaged).toBe(false)
    expect(cash(s, A)).toBe(1500 + 30 - 33)
    expect(err(s, { type: 'unmortgage', player: A, tile: 1 })).toMatch(/No está hipotecada/)
  })

  it('plataformas y servicios también se hipotecan', () => {
    const s = run(own(newGame(), [5, 12], A), { type: 'mortgage', player: A, tile: 5 })
    expect(cash(s, A)).toBe(1600)
  })
})

describe('bancarrota con edificios', () => {
  it('al declararse en bancarrota las propiedades y sus casas vuelven al banco', () => {
    let s = own(newGame(), [1, 3], A, { houses: 2 })
    s = run(s, { type: 'bankrupt', player: A })
    expect(s.owned[1]).toBeUndefined()
    expect(buildingsInUse(s)).toEqual({ houses: 0, hotels: 0 })
  })

  it('si quiebra por una deuda, el acreedor recibe las propiedades sin las casas', () => {
    let s = own(newGame(), [1, 3], A, { houses: 5 })
    // Beto está en la 39, saca 1+1, pasa por la Salida (+200) y cae en la 1 con hotel ($250): no le alcanza
    s = { ...s, current: 1, phase: 'roll', players: s.players.map((p) => (p.id === B ? { ...p, cash: 1, position: 39 } : p)) }
    s = run(s, { type: 'roll', player: B, dice: [1, 1] })
    expect(s.players.find((p) => p.id === B)!.bankrupt).toBe(true)
    expect(s.winner).toBe(A)
  })
})
