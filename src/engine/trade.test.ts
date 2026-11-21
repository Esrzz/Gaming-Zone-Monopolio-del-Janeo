import { describe, expect, it } from 'vitest'
import { applyAction, computeRent, createGame } from './engine'
import { emptySide, isTradable, mortgageFee } from './trade'
import type { Action, GameState, TradeSide } from './types'

const A = 'a'
const B = 'b'
const C = 'c'

const newGame = () =>
  createGame([
    { id: A, name: 'Ana' },
    { id: B, name: 'Beto' },
    { id: C, name: 'Cami' },
  ])

const side = (p: Partial<TradeSide> = {}): TradeSide => ({ ...emptySide(), ...p })

function run(s: GameState, action: Action): GameState {
  const r = applyAction(s, action)
  if (!r.ok) throw new Error(r.error)
  return r.state
}
const fails = (s: GameState, action: Action) => {
  const r = applyAction(s, action)
  return r.ok ? null : r.error
}
const give = (s: GameState, positions: number[], owner: string): GameState => {
  const c = structuredClone(s)
  for (const p of positions) c.owned[p] = { owner, mortgaged: false, houses: 0 }
  return c
}
const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!
const propose = (from: string, to: string, g: Partial<TradeSide>, r: Partial<TradeSide>): Action => ({
  type: 'proposeTrade',
  player: from,
  to,
  give: side(g),
  get: side(r),
})

describe('intercambios', () => {
  it('propiedades y plata cambian de manos al aceptar', () => {
    let s = give(give(newGame(), [1], A), [3], B)
    s = run(s, propose(A, B, { properties: [1], cash: 100 }, { properties: [3] }))
    expect(s.trade).not.toBeNull()
    s = run(s, { type: 'acceptTrade', player: B })
    expect(s.trade).toBeNull()
    expect(s.owned[1].owner).toBe(B)
    expect(s.owned[3].owner).toBe(A)
    expect(player(s, A).cash).toBe(1400)
    expect(player(s, B).cash).toBe(1600)
  })

  it('se puede ofrecer en cualquier turno y no solo el propio', () => {
    // es el turno de Ana (índice 0) y Cami propone
    let s = give(newGame(), [1], A)
    s = run(s, propose(C, A, { cash: 200 }, { properties: [1] }))
    s = run(s, { type: 'acceptTrade', player: A })
    expect(s.owned[1].owner).toBe(C)
  })

  it('un intercambio puede completar un grupo y subir el alquiler', () => {
    let s = give(give(newGame(), [1], A), [3], B)
    expect(computeRent(s, 3)).toBe(4)
    s = run(s, propose(A, B, { cash: 50 }, { properties: [3] }))
    s = run(s, { type: 'acceptTrade', player: B })
    expect(computeRent(s, 3)).toBe(12) // grupo marrón completo: triple
  })

  it('las cartas de salida se pueden intercambiar', () => {
    let s = newGame()
    s.players[0].jailCards = 1
    s = run(s, propose(A, B, { jailCards: 1 }, { cash: 80 }))
    s = run(s, { type: 'acceptTrade', player: B })
    expect(player(s, A).jailCards).toBe(0)
    expect(player(s, B).jailCards).toBe(1)
    expect(player(s, A).cash).toBe(1580)
  })

  it('rechaza ofertas inválidas', () => {
    const s = give(newGame(), [1], A)
    expect(fails(s, propose(A, B, { properties: [3] }, {}))).toMatch(/no es de/) // no es suya
    expect(fails(s, propose(A, B, {}, { properties: [1] }))).toMatch(/no es de/) // pide algo que B no tiene
    expect(fails(s, propose(A, B, { cash: 9999 }, {}))).toMatch(/no tiene esa plata/)
    expect(fails(s, propose(A, B, {}, {}))).toMatch(/vacía/)
    expect(fails(s, propose(A, A, { cash: 10 }, {}))).toMatch(/vos mismo/)
    expect(fails(s, propose(A, B, { cash: -5 }, {}))).toMatch(/inválidos/)
    expect(fails(s, propose(A, B, { cash: 1.5 }, {}))).toMatch(/inválidos/)
    expect(fails(s, propose(A, B, { jailCards: 1 }, {}))).toMatch(/cartas de salida/)
    expect(fails(s, propose(A, B, { properties: [1, 1] }, {}))).toMatch(/repetidas/)
  })

  it('no se pueden intercambiar propiedades de un grupo con casas', () => {
    let s = give(newGame(), [1, 3], A)
    s.owned[1].houses = 1
    expect(isTradable(s, 3)).toBe(false) // la otra del grupo tiene casa
    expect(fails(s, propose(A, B, { properties: [3] }, { cash: 10 }))).toMatch(/casas/)
    s = give(s, [5], A) // las plataformas no tienen casas
    expect(isTradable(s, 5)).toBe(true)
  })

  it('hay una sola oferta abierta a la vez', () => {
    let s = run(newGame(), propose(A, B, { cash: 10 }, {}))
    expect(fails(s, propose(B, C, { cash: 10 }, {}))).toMatch(/oferta abierta/)
    s = run(s, { type: 'cancelTrade', player: A })
    expect(s.trade).toBeNull()
    s = run(s, propose(B, C, { cash: 10 }, {}))
    expect(s.trade?.from).toBe(B)
  })

  it('solo quien recibe acepta o rechaza, y solo quien ofrece cancela', () => {
    const s = run(newGame(), propose(A, B, { cash: 10 }, {}))
    expect(fails(s, { type: 'acceptTrade', player: A })).toMatch(/recibe/)
    expect(fails(s, { type: 'acceptTrade', player: C })).toMatch(/recibe/)
    expect(fails(s, { type: 'rejectTrade', player: C })).toMatch(/recibe/)
    expect(fails(s, { type: 'cancelTrade', player: B })).toMatch(/ofrece|hizo/)
    expect(run(s, { type: 'rejectTrade', player: B }).trade).toBeNull()
    expect(fails(newGame(), { type: 'acceptTrade', player: B })).toMatch(/ninguna oferta/)
  })

  it('al aceptar se vuelve a validar (la plata puede haber cambiado)', () => {
    let s = run(newGame(), propose(A, B, { cash: 1000 }, {}))
    s = structuredClone(s)
    player(s, A).cash = 100 // entre la oferta y la respuesta, Ana gastó
    expect(fails(s, { type: 'acceptTrade', player: B })).toMatch(/no tiene esa plata/)
    expect(s.trade).not.toBeNull() // sigue abierta: B puede rechazarla
  })

  it('propiedad hipotecada: quien la recibe paga el 10% al banco', () => {
    let s = give(newGame(), [3], A) // Baltic: precio 60, hipoteca 30, interés 3
    s.owned[3].mortgaged = true
    expect(mortgageFee(3)).toBe(3)
    s = run(s, propose(A, B, { properties: [3] }, {}))
    s = run(s, { type: 'acceptTrade', player: B })
    expect(s.owned[3].owner).toBe(B)
    expect(s.owned[3].mortgaged).toBe(true) // sigue hipotecada
    expect(player(s, B).cash).toBe(1497)
  })

  it('quien no llega a pagar el interés no puede recibir la hipotecada', () => {
    let s = give(newGame(), [39], A) // 400 -> hipoteca 200 -> interés 10
    s.owned[39].mortgaged = true
    s.players[1].cash = 5
    expect(fails(s, propose(A, B, { properties: [39] }, {}))).toMatch(/interés/)
  })

  it('si un jugador quiebra, se cancela su oferta abierta', () => {
    let s = run(newGame(), propose(A, B, { cash: 10 }, {}))
    s = run(s, { type: 'bankrupt', player: B })
    expect(s.trade).toBeNull()
  })

  it('no se puede operar con jugadores quebrados', () => {
    const s = run(newGame(), { type: 'bankrupt', player: B })
    expect(fails(s, propose(A, B, { cash: 10 }, {}))).toMatch(/inválido/)
  })
})
