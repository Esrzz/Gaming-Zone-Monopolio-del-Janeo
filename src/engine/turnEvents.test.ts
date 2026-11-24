import { describe, expect, it } from 'vitest'
import { applyAction, createGame } from './engine'
import type { Action, GameEvent, GameState } from './types'

const mk = (n = 3) => createGame(['a', 'b', 'c'].slice(0, n).map((id) => ({ id, name: id })), {}, 5)
const run = (s: GameState, a: Action): { state: GameState; events: GameEvent[] } => {
  const r = applyAction(s, a)
  if (!r.ok) throw new Error(r.error)
  return r
}
const turns = (ev: GameEvent[]) => ev.filter((e) => e.type === 'turn')

describe('evento de cambio de turno (el que dispara el aviso "Turno de…")', () => {
  it('no se emite al tirar, caer en una casilla, comprar ni con dobles', () => {
    let s = mk()
    s.players[0].position = 3
    let r = run(s, { type: 'roll', player: 'a', dice: [1, 1] }) // dobles: 3 → 5, plataforma libre
    expect(turns(r.events)).toHaveLength(0)
    s = r.state
    expect(s.phase).toBe('buy')
    r = run(s, { type: 'buy', player: 'a' })
    expect(turns(r.events)).toHaveLength(0)
    expect(r.state.phase).toBe('roll') // volvió a tirar por los dobles: el turno sigue siendo de a
    expect(r.state.players[r.state.current].id).toBe('a')
  })

  it('no se emite al rechazar una compra ni mientras dura la subasta', () => {
    let s = mk()
    s.players[0].position = 3
    s = run(s, { type: 'roll', player: 'a', dice: [1, 1] }).state
    let r = run(s, { type: 'decline', player: 'a' })
    expect(turns(r.events)).toHaveLength(0)
    r = run(r.state, { type: 'bid', player: 'b', amount: 20 })
    expect(turns(r.events)).toHaveLength(0)
    r = run(r.state, { type: 'closeAuction', player: 'a' })
    expect(turns(r.events)).toHaveLength(0)
  })

  it('no se emite al estar preso sin salir ni al gestionar propiedades', () => {
    let s = mk()
    s.players[0].inJail = true
    s.players[0].position = 10
    const r = run(s, { type: 'roll', player: 'a', dice: [1, 2] })
    expect(turns(r.events)).toHaveLength(0)
    expect(r.state.phase).toBe('end')
  })

  it('se emite una sola vez, al terminar el turno de verdad', () => {
    let s = mk()
    s = run(s, { type: 'roll', player: 'a', dice: [1, 2] }).state // 0 → 3
    s = run(s, { type: 'decline', player: 'a' }).state
    s = run(s, { type: 'passAuction', player: 'a' }).state
    s = run(s, { type: 'passAuction', player: 'b' }).state
    const r = run(run(s, { type: 'passAuction', player: 'c' }).state, { type: 'endTurn', player: 'a' })
    expect(turns(r.events)).toEqual([{ type: 'turn', player: 'b' }])
  })

  it('se emite cuando quiebra el jugador de turno (pasa al siguiente) y no cuando quiebra otro', () => {
    const s = mk()
    expect(turns(run(s, { type: 'bankrupt', player: 'c' }).events)).toHaveLength(0)
    expect(turns(run(s, { type: 'bankrupt', player: 'a' }).events)).toEqual([{ type: 'turn', player: 'b' }])
  })

  it('terminar el turno con dobles pendientes no es posible: no hay aviso falso', () => {
    let s = mk()
    s.players[0].position = 1
    s = run(s, { type: 'roll', player: 'a', dice: [1, 1] }).state // 1 → 3, casilla comprable
    s = run(s, { type: 'decline', player: 'a' }).state
    s = run(s, { type: 'passAuction', player: 'a' }).state
    s = run(s, { type: 'passAuction', player: 'b' }).state
    s = run(s, { type: 'passAuction', player: 'c' }).state
    expect(s.phase).toBe('roll')
    expect(applyAction(s, { type: 'endTurn', player: 'a' }).ok).toBe(false)
  })
})
