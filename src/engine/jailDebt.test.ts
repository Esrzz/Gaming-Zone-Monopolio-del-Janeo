import { describe, expect, it } from 'vitest'
import { applyAction, createGame } from './engine'
import type { Action, GameState } from './types'

const run = (s: GameState, a: Action) => {
  const r = applyAction(s, a)
  if (!r.ok) throw new Error(r.error)
  return r
}

/** a está preso en su último turno, casi sin plata pero con propiedades para hipotecar */
const setup = (cash: number, props: number[]): GameState => {
  const s = createGame(['a', 'b'].map((id) => ({ id, name: id })), {}, 5)
  const a = s.players[0]
  a.inJail = true
  a.position = 10
  a.jailTurns = s.rules.maxJailTurns - 1
  a.cash = cash
  for (const p of props) s.owned[p] = { owner: 'a', mortgaged: false, houses: 0 }
  return s
}

describe('cárcel con deuda', () => {
  it('la multa obligatoria sin plata en mano queda como deuda: sale de la cárcel, se mueve y hay que saldarla', () => {
    const r = run(setup(10, [1, 3]), { type: 'roll', player: 'a', dice: [1, 2] })
    expect(r.state.players[0]).toMatchObject({ inJail: false, position: 13 })
    expect(r.state.debts).toEqual([{ from: 'a', to: 'bank', amount: 50 }])
    expect(applyAction(r.state, { type: 'buy', player: 'a' }).ok).toBe(false) // bloqueado hasta saldarla
    expect(applyAction(r.state, { type: 'endTurn', player: 'a' }).ok).toBe(false)
  })

  it('al hipotecar se paga sola y se puede seguir el turno', () => {
    let s = run(setup(10, [1, 3]), { type: 'roll', player: 'a', dice: [1, 2] }).state
    s = run(s, { type: 'mortgage', player: 'a', tile: 1 }).state
    s = run(s, { type: 'mortgage', player: 'a', tile: 3 }).state
    expect(s.debts).toHaveLength(0)
    expect(s.players[0].cash).toBe(10 + 30 + 30 - 50)
    expect(s.phase).toBe('buy')
    s = run(s, { type: 'decline', player: 'a' }).state
    expect(s.auction).not.toBeNull()
  })

  it('si ni liquidando todo alcanza para la multa, quiebra', () => {
    const r = run(setup(10, []), { type: 'roll', player: 'a', dice: [1, 2] })
    expect(r.state.players[0].bankrupt).toBe(true)
    expect(r.state.phase).toBe('over')
  })

  it('pasar por la salida con la tirada que lo libera cubre la deuda sin hipotecar', () => {
    const s = setup(10, [1])
    s.players[0].position = 10
    const r = run(s, { type: 'roll', player: 'a', dice: [6, 6] }) // dobles: sale gratis (no hay multa)
    expect(r.state.debts).toHaveLength(0)
    expect(r.state.players[0].inJail).toBe(false)
  })

  it('con el tiempo agotado y una deuda, el motor lo declara en bancarrota (no se traba la partida)', async () => {
    const { timeoutAction } = await import('./engine')
    const s = run(setup(10, [1, 3]), { type: 'roll', player: 'a', dice: [1, 2] }).state
    expect(timeoutAction(s)).toEqual({ type: 'bankrupt', player: 'a' })
  })
})
