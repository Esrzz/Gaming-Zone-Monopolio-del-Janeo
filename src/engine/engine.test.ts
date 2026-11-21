import { describe, expect, it } from 'vitest'
import ranking from '../data/ranking.json'
import { BOARD, groupPositions, isBuyable } from './board'
import { applyAction, computeRent, createGame, currentPlayer, shuffledOrder } from './engine'
import { CHANCE_CARDS, CHEST_CARDS } from './cards'
import type { Action, GameEvent, GameState } from './types'

const A = 'a'
const B = 'b'
const C = 'c'

const noShuffle = () => 0.999999 // sin mezclar: mazos en el orden de la lista (tests deterministas)
const newGame = (rules = {}) =>
  createGame(
    [
      { id: A, name: 'Ana' },
      { id: B, name: 'Beto' },
    ],
    rules,
    noShuffle,
  )

function run(s: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const r = applyAction(s, action)
  if (!r.ok) throw new Error(r.error)
  return r
}

const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!

/** Deja al jugador de turno a `steps` casillas de `target` para que una tirada lo haga caer ahí. */
function setPos(s: GameState, id: string, pos: number): GameState {
  const c = structuredClone(s)
  player(c, id).position = pos
  return c
}

function give(s: GameState, positions: number[], owner: string): GameState {
  const c = structuredClone(s)
  for (const p of positions) c.owned[p] = { owner, mortgaged: false, houses: 0 }
  return c
}

const roll = (id: string, a: number, b: number): Action => ({ type: 'roll', player: id, dice: [a, b] })

describe('tablero', () => {
  it('tiene 40 casillas y 28 comprables', () => {
    expect(BOARD).toHaveLength(40)
    expect(BOARD.filter(isBuyable)).toHaveLength(28)
  })
  it('los grupos tienen 2 o 3 calles', () => {
    expect(groupPositions('brown')).toHaveLength(2)
    expect(groupPositions('darkblue')).toHaveLength(2)
    expect(groupPositions('red')).toHaveLength(3)
  })
})

describe('asignación de juegos', () => {
  const streets = BOARD.flatMap((t, i) => (t.kind === 'property' ? [{ t, i }] : []))
  it('hay 22 calles con juegos distintos', () => {
    expect(streets).toHaveLength(22)
    expect(new Set(streets.map((s) => s.t.name)).size).toBe(22)
  })
  it('el juego más jugado está en la casilla más cara y el menos jugado en la más barata', () => {
    expect(BOARD[39].name).toBe(ranking[0].name)
    expect(BOARD[1].name).toBe(ranking[21].name)
  })
  it('las calles bajan de horas a medida que bajan de precio', () => {
    const hours = Object.fromEntries(ranking.map((g) => [g.name, g.hours]))
    const byPrice = [...streets].sort((a, b) => (a.t as { price: number }).price - (b.t as { price: number }).price)
    const h = byPrice.map((s) => hours[s.t.name])
    for (let i = 1; i < h.length; i++) expect(h[i]).toBeGreaterThanOrEqual(h[i - 1])
  })
  it('plataformas y servicios', () => {
    expect([5, 15, 25, 35].map((i) => BOARD[i].name)).toEqual(['YouTube', 'Spotify', 'Twitch', 'Steam'])
    expect([12, 28].map((i) => BOARD[i].name)).toEqual(['Mute', 'Deafen'])
  })
})

describe('crear partida', () => {
  it('reparte plata inicial configurable', () => {
    const s = newGame({ startingCash: 2000 })
    expect(s.players.map((p) => p.cash)).toEqual([2000, 2000])
  })
  it('exige entre 2 y 6 jugadores', () => {
    expect(() => createGame([{ id: A, name: 'x' }])).toThrow()
    const seven = Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: 'x' }))
    expect(() => createGame(seven)).toThrow()
  })
})

describe('turnos y movimiento', () => {
  it('mueve la ficha y rechaza a quien no tiene el turno', () => {
    const s = newGame()
    const r = applyAction(s, roll(B, 1, 2))
    expect(r.ok).toBe(false)
    const { state } = run(s, roll(A, 1, 2))
    expect(player(state, A).position).toBe(3)
  })

  it('cobra la salida al pasar por ella', () => {
    let s = setPos(newGame(), A, 38)
    s = run(s, roll(A, 1, 4)).state // cae en 3
    expect(player(s, A).position).toBe(3)
    expect(player(s, A).cash).toBe(1500 + 200)
  })

  it('rechaza dados inválidos', () => {
    expect(applyAction(newGame(), roll(A, 0, 7)).ok).toBe(false)
  })

  it('cae en propiedad libre, compra y pasa el turno', () => {
    let s = run(newGame(), roll(A, 1, 2)).state // casilla 3
    expect(s.phase).toBe('buy')
    s = run(s, { type: 'buy', player: A }).state
    expect(player(s, A).cash).toBe(1500 - 60)
    expect(s.owned[3].owner).toBe(A)
    expect(s.phase).toBe('end')
    s = run(s, { type: 'endTurn', player: A }).state
    expect(currentPlayer(s).id).toBe(B)
    expect(s.phase).toBe('roll')
  })

  it('no deja comprar sin plata', () => {
    let s = newGame()
    s.players[0].cash = 10
    s = run(s, roll(A, 1, 2)).state
    expect(applyAction(s, { type: 'buy', player: A }).ok).toBe(false)
    s = run(s, { type: 'decline', player: A }).state
    expect(s.phase).toBe('end')
    expect(s.owned[3]).toBeUndefined()
  })

  it('con dobles vuelve a tirar', () => {
    let s = run(newGame(), roll(A, 1, 1)).state // casilla 2: arca comunal → fase card
    expect(s.phase).toBe('card')
    expect(currentPlayer(s).id).toBe(A)
    s = run(s, { type: 'drawCard', player: A }).state // resuelve la carta, debe quedar en 'roll' (dobles)
    expect(s.phase).toBe('roll')
    expect(currentPlayer(s).id).toBe(A)
    s = run(s, roll(A, 1, 2)).state
    expect(s.phase).toBe('buy') // 2 + 3 = 5
  })
})

describe('alquileres', () => {
  it('paga alquiler base al dueño', () => {
    let s = give(newGame(), [3], B) // Baltic: 4
    s = run(s, roll(A, 1, 2)).state
    expect(player(s, A).cash).toBe(1496)
    expect(player(s, B).cash).toBe(1504)
    expect(s.phase).toBe('end')
  })

  it('triplica con el grupo completo y sin casas', () => {
    const s = give(newGame(), [1, 3], B)
    expect(computeRent(s, 3)).toBe(12)
    const three = give(newGame(), [6, 8, 9], B)
    expect(computeRent(three, 9)).toBe(24)
  })

  it('con el grupo incompleto cobra el alquiler base', () => {
    expect(computeRent(give(newGame(), [6, 8], B), 6)).toBe(6)
    // un grupo completo repartido entre dos jugadores tampoco multiplica
    const split = give(give(newGame(), [6, 8], B), [9], A)
    expect(computeRent(split, 6)).toBe(6)
  })

  it('el multiplicador del grupo es configurable (oficial: doble)', () => {
    const s = give(newGame({ fullSetMultiplier: 2 }), [1, 3], B)
    expect(computeRent(s, 3)).toBe(8)
  })

  it('usa la tabla de casas', () => {
    const s = give(newGame(), [1, 3], B)
    s.owned[3].houses = 2
    expect(computeRent(s, 3)).toBe(60)
  })

  it('no cobra si está hipotecada ni si es propia', () => {
    const s = give(newGame(), [3], B)
    s.owned[3].mortgaged = true
    expect(computeRent(s, 3)).toBe(0)
    const own = run(give(newGame(), [3], A), roll(A, 1, 2)).state
    expect(player(own, A).cash).toBe(1500)
  })

  it('plataformas: 50, 100, 150, 200 según cuántas tenga el dueño', () => {
    expect(computeRent(give(newGame(), [5], B), 5)).toBe(50)
    expect(computeRent(give(newGame(), [5, 15], B), 5)).toBe(100)
    expect(computeRent(give(newGame(), [5, 15, 25], B), 5)).toBe(150)
    expect(computeRent(give(newGame(), [5, 15, 25, 35], B), 5)).toBe(200)
  })

  it('las plataformas de otro dueño no suman', () => {
    const s = give(give(newGame(), [5], B), [15, 25], A)
    expect(computeRent(s, 5)).toBe(50)
  })

  it('servicios: 4x o 10x los dados', () => {
    let s = give(newGame(), [12], B)
    s.lastDice = [3, 4]
    expect(computeRent(s, 12)).toBe(28)
    s = give(s, [28], B)
    expect(computeRent(s, 12)).toBe(70)
  })
})

describe('impuestos y estacionamiento', () => {
  it('el impuesto va al banco', () => {
    let s = setPos(newGame(), A, 1)
    s = run(s, roll(A, 1, 2)).state // casilla 4
    expect(player(s, A).cash).toBe(1300)
    expect(s.pot).toBe(0)
  })

  it('con pozo activado, los impuestos se cobran en Estacionamiento', () => {
    let s = setPos(newGame({ freeParkingJackpot: true }), A, 1)
    s = run(s, roll(A, 1, 2)).state
    expect(s.pot).toBe(200)
    s = run(s, { type: 'endTurn', player: A }).state
    s = setPos(s, B, 17)
    s = run(s, roll(B, 1, 2)).state // 20
    expect(player(s, B).cash).toBe(1700)
    expect(s.pot).toBe(0)
  })
})

describe('cárcel', () => {
  it('casilla "Banneo" te manda a la cárcel y corta los dobles', () => {
    let s = setPos(newGame(), A, 28)
    s = run(s, roll(A, 1, 1)).state // 30
    expect(player(s, A).inJail).toBe(true)
    expect(player(s, A).position).toBe(10)
    expect(s.phase).toBe('end')
  })

  it('tres dobles seguidos mandan a la cárcel', () => {
    // Posiciono a A en 1 para que los dobles no caigan en casillas de cartas:
    // 1+1+1 → 3 (brown, comprable), 2+2 → 7 (suerte), 3+3 → 13 (pink, comprable)
    // Para evitar cartas, posiciono en 11 → 11+2=13 (pink), 13+4=17 (arca), etc.
    // Lo más simple: usar casillas de propiedad directamente con setPos.
    // Desde pos=0: 1+1=2(arca), así que mejor empezar desde 3.
    let s = setPos(newGame(), A, 3) // start en brown
    // primer doble: 3+2=5 → YouTube (plataforma libre)
    s = run(s, roll(A, 1, 1)).state // 3+2 = 5
    // casilla 5 es YouTube (plataforma libre) → fase buy
    s = run(s, { type: 'decline', player: A }).state
    expect(s.phase).toBe('roll')
    // segundo doble: 5+4 = 9 → lightblue (propiedad libre)
    s = run(s, roll(A, 2, 2)).state
    s = run(s, { type: 'decline', player: A }).state
    expect(s.phase).toBe('roll')
    // tercer doble: va a la cárcel
    s = run(s, roll(A, 3, 3)).state
    expect(player(s, A).inJail).toBe(true)
    expect(s.phase).toBe('end')
  })

  it('sale con dobles y no vuelve a tirar', () => {
    let s = newGame()
    s.players[0].inJail = true
    s.players[0].position = 10
    s = run(s, roll(A, 2, 2)).state
    expect(player(s, A).inJail).toBe(false)
    expect(player(s, A).position).toBe(14)
    expect(s.phase).not.toBe('roll')
  })

  it('sin dobles se queda; a la tercera paga y avanza', () => {
    let s = newGame()
    s.players[0].inJail = true
    s.players[0].position = 10
    s = run(s, roll(A, 1, 2)).state
    expect(player(s, A).inJail).toBe(true)
    expect(player(s, A).jailTurns).toBe(1)
    expect(s.phase).toBe('end')

    // tercera tirada fallida: paga la multa y avanza
    s.phase = 'roll'
    s.players[0].jailTurns = 2
    const r = run(s, roll(A, 1, 2)).state
    expect(player(r, A).inJail).toBe(false)
    expect(player(r, A).cash).toBe(1500 - 50)
    expect(player(r, A).position).toBe(13)
  })

  it('paga la multa o usa la carta antes de tirar', () => {
    let s = newGame()
    s.players[0].inJail = true
    s.players[0].jailCards = 1
    const fine = run(s, { type: 'payJailFine', player: A }).state
    expect(player(fine, A).inJail).toBe(false)
    expect(player(fine, A).cash).toBe(1450)
    expect(fine.phase).toBe('roll')
    const card = run(s, { type: 'useJailCard', player: A }).state
    expect(player(card, A).jailCards).toBe(0)
    expect(player(card, A).cash).toBe(1500)
    expect(applyAction(newGame(), { type: 'payJailFine', player: A }).ok).toBe(false)
  })
})

describe('bancarrota', () => {
  it('quiebra por alquiler: los bienes pasan al acreedor y gana el último', () => {
    let s = give(newGame(), [39, 3], B)
    s.owned[39].houses = 5 // Forza Horizon 6 con hotel: 2000
    s.players[0].position = 36
    s.players[0].cash = 100
    s = run(s, roll(A, 1, 2)).state // 39
    expect(player(s, A).bankrupt).toBe(true)
    expect(player(s, B).cash).toBe(1600)
    expect(s.winner).toBe(B)
    expect(s.phase).toBe('over')
    expect(applyAction(s, roll(B, 1, 2)).ok).toBe(false)
  })

  it('declararse en bancarrota devuelve las propiedades al banco', () => {
    let s = give(newGame(), [1], A)
    s = run(s, { type: 'bankrupt', player: A }).state
    expect(s.owned[1]).toBeUndefined()
    expect(s.winner).toBe(B)
  })

  it('con tres jugadores, la partida sigue y se saltea al quebrado', () => {
    let s = createGame(
      [
        { id: A, name: 'Ana' },
        { id: B, name: 'Beto' },
        { id: C, name: 'Cami' },
      ],
      {},
      noShuffle,
    )
    s = run(s, { type: 'bankrupt', player: A }).state
    expect(s.phase).toBe('roll')
    expect(currentPlayer(s).id).toBe(B)
    s = run(s, roll(B, 1, 2)).state
    s = run(s, { type: 'decline', player: B }).state
    s = run(s, { type: 'endTurn', player: B }).state
    expect(currentPlayer(s).id).toBe(C)
    s = run(s, roll(C, 1, 2)).state
    s = run(s, { type: 'decline', player: C }).state
    s = run(s, { type: 'endTurn', player: C }).state
    expect(currentPlayer(s).id).toBe(B) // saltea a Ana, que quebró
  })
})

describe('mazos de cartas', () => {
  const players = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ]
  const seeded = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  it('cada mazo es una permutación completa de sus cartas', () => {
    const s = createGame(players)
    expect([...s.chanceOrder].sort((x, y) => x - y)).toEqual(CHANCE_CARDS.map((_, i) => i))
    expect([...s.chestOrder].sort((x, y) => x - y)).toEqual(CHEST_CARDS.map((_, i) => i))
  })

  it('el orden depende del azar inyectado: misma semilla = mismo orden, otra semilla = otro orden', () => {
    expect(createGame(players, {}, seeded(1)).chanceOrder).toEqual(createGame(players, {}, seeded(1)).chanceOrder)
    expect(createGame(players, {}, seeded(1)).chanceOrder).not.toEqual(createGame(players, {}, seeded(2)).chanceOrder)
    expect(shuffledOrder(10, seeded(7))).not.toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('las cartas salen en el orden barajado, no en el de la lista', () => {
    let s = createGame(players, {}, seeded(3))
    s = { ...s, current: 0, phase: 'roll', players: s.players.map((p) => ({ ...p, position: 0 })) }
    const r = applyAction(s, { type: 'roll', player: 'a', dice: [3, 4] }) // casilla 7: Suerte
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.state.pendingCard?.cardId).toBe(CHANCE_CARDS[s.chanceOrder[0]].id)
  })
})
