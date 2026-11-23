import { describe, expect, it } from 'vitest'
import { applyAction, createGame, currentPlayer, timeoutAction } from './engine'
import { advanceClock, ORDER_ROLL_MS } from './clock'
import type { GameState } from './types'

const ids = ['a', 'b', 'c', 'd']
const start = (n = 4): GameState => createGame(ids.slice(0, n).map((id) => ({ id, name: id.toUpperCase() })), {}, 7, undefined, { order: true })
const roll = (s: GameState, dice: [number, number]) => {
  const r = applyAction(s, { type: 'orderRoll', player: currentPlayer(s).id, dice })
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('orden de salida por dados', () => {
  it('arranca en la fase order, tira primero el primero en llegar y nadie más puede hacer nada', () => {
    const s = start()
    expect(s.phase).toBe('order')
    expect(currentPlayer(s).id).toBe('a')
    expect(applyAction(s, { type: 'roll', player: 'a' }).ok).toBe(false)
    expect(applyAction(s, { type: 'orderRoll', player: 'b' }).ok).toBe(false) // no es su turno de tirar
    expect(applyAction(s, { type: 'proposeTrade', player: 'a', to: 'b', give: { cash: 10, properties: [], jailCards: 0 }, get: { cash: 0, properties: [], jailCards: 0 } }).ok).toBe(false)
  })

  it('sin empates: el que saca más va primero y se reasigna el orden', () => {
    let s = start()
    for (const d of [[1, 2], [6, 5], [3, 3], [2, 1]] as [number, number][]) s = roll(s, d).state
    // a=3, b=11, c=6, d=3 → b, c y luego a/d empatados con 3
    expect(s.phase).toBe('order') // a y d empataron en el último lugar: vuelven a tirar
    expect(s.order!.queue).toEqual(['a', 'd'])
    s = roll(s, [4, 4]).state // a = 8
    const last = roll(s, [1, 1]) // d = 2
    expect(last.state.phase).toBe('roll')
    expect(last.state.players.map((p) => p.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(currentPlayer(last.state).id).toBe('b')
    expect(last.events.some((e) => e.type === 'orderSet')).toBe(true)
    expect(last.state.order).toBeNull()
  })

  it('el empate por el primer puesto se repite hasta desempatar', () => {
    let s = start(3)
    for (const d of [[6, 6], [6, 6], [1, 2]] as [number, number][]) s = roll(s, d).state
    expect(s.order!.queue).toEqual(['a', 'b'])
    expect(s.order!.round).toBe(2)
    for (const d of [[5, 5], [5, 5]] as [number, number][]) s = roll(s, d).state // otra vez empatan
    expect(s.order!.round).toBe(3)
    s = roll(s, [2, 2]).state
    const done = roll(s, [2, 1]) // a=4 gana a b=3
    expect(done.state.phase).toBe('roll')
    expect(done.state.players.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('si el que gana el desempate es el segundo en llegar, pasa adelante', () => {
    let s = start(3)
    for (const d of [[6, 6], [6, 6], [1, 2]] as [number, number][]) s = roll(s, d).state
    s = roll(s, [1, 2]).state // a=3
    const done = roll(s, [6, 5]) // b=11
    expect(done.state.players.map((p) => p.id)).toEqual(['b', 'a', 'c'])
  })

  it('con el tiempo agotado se tira solo (el servidor decide los dados)', () => {
    const s = start()
    expect(timeoutAction(s)).toEqual({ type: 'orderRoll', player: 'a' })
    const r = applyAction(s, { type: 'orderRoll', player: 'a' }, { clientDice: false })
    expect(r.ok && r.state.order!.rolls.a).toHaveLength(2)
    expect(applyAction(s, { type: 'orderRoll', player: 'a', dice: [6, 6] }, { clientDice: false }).ok).toBe(false)
  })

  it('si alguien se va mientras se define el orden, el resto sigue', () => {
    let s = start(3)
    s = roll(s, [3, 3]).state // a
    const out = applyAction(s, { type: 'abandon', player: 'b' }) // b se va antes de tirar
    expect(out.ok && out.state.order!.queue).toEqual(['c'])
    if (!out.ok) throw new Error(out.error)
    const done = roll(out.state, [1, 2])
    expect(done.state.phase).toBe('roll')
    expect(done.state.players.filter((p) => !p.bankrupt).map((p) => p.id)).toEqual(['a', 'c'])
    expect(currentPlayer(done.state).id).toBe('a')
  })

  it('el reloj de la fase de orden es corto y se reinicia al empezar el primer turno', () => {
    const s = start(2)
    const cfg = { turnMs: 240_000, tradeMs: 60_000 }
    const c1 = advanceClock({ player: null, turnEndsAt: null, turnPausedMs: null, tradeEndsAt: null, tradeTo: null }, s, 1000, cfg)
    expect(c1.turnEndsAt).toBe(1000 + ORDER_ROLL_MS)
    // a tira, b tira → empieza la partida con 'a' o 'b' primero: reloj completo
    const s2 = roll(roll(s, [6, 6]).state, [1, 1]).state
    const c2 = advanceClock(c1, s2, 5000, cfg)
    expect(c2.turnEndsAt).toBe(5000 + 240_000)
  })
})
