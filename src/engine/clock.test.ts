import { describe, expect, it } from 'vitest'
import { advanceClock, clockView, emptyClock, isDue, nextDeadline } from './clock'
import { applyAction, createGame, timeoutAction } from './engine'
import { emptySide } from './trade'
import type { Action, GameState } from './types'

const cfg = { turnMs: 240_000, tradeMs: 60_000 }
const newGame = () => createGame([{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }], {}, () => 0.999999)
const run = (s: GameState, a: Action) => {
  const r = applyAction(s, a)
  if (!r.ok) throw new Error(r.error)
  return r.state
}

describe('relojes', () => {
  it('el turno arranca con el tiempo completo y vence', () => {
    const s = newGame()
    const c = advanceClock(emptyClock(), s, 1000, cfg)
    expect(c.turnEndsAt).toBe(241_000)
    expect(isDue(c, 240_999)).toBe(false)
    expect(isDue(c, 241_000)).toBe(true)
    expect(nextDeadline(c)).toBe(241_000)
  })

  it('no se reinicia mientras sigue el mismo jugador, sí al cambiar de turno', () => {
    let s = newGame()
    let c = advanceClock(emptyClock(), s, 0, cfg)
    s = { ...s, phase: 'end' }
    c = advanceClock(c, s, 100_000, cfg)
    expect(c.turnEndsAt).toBe(240_000)
    s = run(s, { type: 'endTurn', player: 'a' })
    c = advanceClock(c, s, 100_000, cfg)
    expect(c.player).toBe('b')
    expect(c.turnEndsAt).toBe(340_000)
  })

  it('el intercambio pausa el turno y al resolverse sigue donde estaba', () => {
    let s: GameState = { ...newGame(), phase: 'end' }
    s.owned[1] = { owner: 'a', mortgaged: false, houses: 0 }
    let c = advanceClock(emptyClock(), s, 0, cfg)
    s = run(s, { type: 'proposeTrade', player: 'a', to: 'b', give: { ...emptySide(), cash: 10 }, get: emptySide() })
    c = advanceClock(c, s, 200_000, cfg) // quedaban 40 s
    expect(c.turnEndsAt).toBeNull()
    expect(c.tradeEndsAt).toBe(260_000)
    expect(clockView(c, 230_000)).toEqual({ turnMsLeft: 40_000, tradeMsLeft: 30_000 })
    s = run(s, { type: 'rejectTrade', player: 'b' })
    c = advanceClock(c, s, 230_000, cfg)
    expect(c.tradeEndsAt).toBeNull()
    expect(c.turnEndsAt).toBe(270_000)
  })

  it('vencer el reloj encadena acciones automáticas hasta pasar el turno', () => {
    let s = newGame()
    let c = advanceClock(emptyClock(), s, 0, cfg)
    let now = 240_000
    for (let i = 0; i < 30 && isDue(c, now); i++) {
      const act = timeoutAction(s)!
      s = run(s, act)
      c = advanceClock(c, s, now, cfg)
      // si el turno cayó en una subasta, esta vence por su cuenta y sigue la cadena
      if (s.auction && !isDue(c, now)) {
        now = c.auctionEndsAt!
        expect(isDue(c, now)).toBe(true)
      }
    }
    expect(c.player).toBe('b')
    expect(isDue(c, now)).toBe(false)
  })

  it('sin partida o terminada no hay relojes', () => {
    expect(advanceClock(emptyClock(), null, 0, cfg)).toEqual(emptyClock())
    expect(advanceClock(emptyClock(), { ...newGame(), phase: 'over' }, 0, cfg)).toEqual(emptyClock())
  })
})
