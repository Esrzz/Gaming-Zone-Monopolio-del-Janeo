import { describe, expect, it } from 'vitest'
import { applyAction, createGame } from './engine'
import { CHANCE_CARDS, CHEST_CARDS } from './cards'
import type { Action, GameEvent, GameState } from './types'

const run = (s: GameState, a: Action): { state: GameState; events: GameEvent[] } => {
  const r = applyAction(s, a, { clientDice: false })
  if (!r.ok) throw new Error(r.error)
  return r
}
const mk = () => createGame(['a', 'b'].map((id) => ({ id, name: id })), {}, 3)

/** a cae en la Suerte de la casilla 36 y saca "retroceder 3" (ch-09): termina en Arcas del discord (33) */
const chainGame = (): GameState => {
  const s = mk()
  s.players[0].position = 36
  s.decks.chance.draw = ['ch-09', ...s.decks.chance.draw.filter((c) => c !== 'ch-09')]
  s.decks.chest.discard = s.decks.chest.discard.filter((c) => c !== 'cc-05')
  s.decks.chest.draw = ['cc-05', ...s.decks.chest.draw.filter((c) => c !== 'cc-05')]
  s.pendingCard = { deck: 'chance', cardId: s.decks.chance.draw.shift()! }
  s.phase = 'card'
  return s
}

describe('carta que lleva a otra casilla de carta', () => {
  it('la carta nueva queda pendiente: no se salta ni se pierde', () => {
    const r = run(chainGame(), { type: 'drawCard', player: 'a' })
    expect(r.state.players[0].position).toBe(33)
    expect(r.state.phase).toBe('card')
    expect(r.state.pendingCard).toEqual({ deck: 'chest', cardId: 'cc-05' })
    expect(applyAction(r.state, { type: 'endTurn', player: 'a' }).ok).toBe(false) // no se puede terminar sin robarla
  })

  it('al robarla se aplica (cc-05 = carta de salir de la cárcel, que queda en la mano) y el turno sigue', () => {
    let s = run(chainGame(), { type: 'drawCard', player: 'a' }).state
    s = run(s, { type: 'drawCard', player: 'a' }).state
    expect(s.players[0].jailCards).toBe(1)
    expect(s.pendingCard).toBeNull()
    expect(['roll', 'end']).toContain(s.phase)
  })

  it('el mazo no pierde cartas: todas siguen en algún lado después de la cadena', () => {
    let s = run(chainGame(), { type: 'drawCard', player: 'a' }).state
    s = run(s, { type: 'drawCard', player: 'a' }).state
    const inChance = [...s.decks.chance.draw, ...s.decks.chance.discard]
    const inChest = [...s.decks.chest.draw, ...s.decks.chest.discard]
    expect(inChance.sort()).toEqual(CHANCE_CARDS.map((c) => c.id).sort())
    // la de salir de la cárcel está en la mano de a, no en el mazo
    expect(inChest.sort()).toEqual(CHEST_CARDS.map((c) => c.id).filter((id) => id !== 'cc-05').sort())
  })
})

describe('intercambio abierto y rechazo de compra', () => {
  it('rechazar la compra cancela el intercambio abierto (no conviven con la subasta)', () => {
    let s = mk()
    s.players[0].position = 3
    s.phase = 'buy'
    s = run(s, { type: 'proposeTrade', player: 'a', to: 'b', give: { cash: 50, properties: [], jailCards: 0 }, get: { cash: 0, properties: [], jailCards: 0 } }).state
    expect(s.trade).not.toBeNull()
    const r = run(s, { type: 'decline', player: 'a' })
    expect(r.state.trade).toBeNull()
    expect(r.state.auction).not.toBeNull()
    expect(r.events.map((e) => e.type)).toContain('trade-cancelled')
  })

  it('comprar con un intercambio abierto no lo toca', () => {
    let s = mk()
    s.players[0].position = 3
    s.phase = 'buy'
    s = run(s, { type: 'proposeTrade', player: 'a', to: 'b', give: { cash: 50, properties: [], jailCards: 0 }, get: { cash: 0, properties: [], jailCards: 0 } }).state
    s = run(s, { type: 'buy', player: 'a' }).state
    expect(s.trade).not.toBeNull()
  })
})
