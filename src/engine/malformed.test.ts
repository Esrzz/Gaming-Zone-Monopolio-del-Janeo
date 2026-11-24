import { describe, expect, it } from 'vitest'
import { applyAction, createGame } from './engine'
import { parseClientMessage } from './protocol'

const msg = (action: Record<string, unknown>) => parseClientMessage(JSON.stringify({ t: 'action', action: { player: 'a', ...action } }))
const side = { cash: 0, properties: [], jailCards: 0 }

describe('acciones mal formadas: el servidor las descarta antes de llegar al motor', () => {
  it('acepta las bien formadas', () => {
    expect(msg({ type: 'roll' })).not.toBeNull()
    expect(msg({ type: 'roll', dice: [3, 4] })).not.toBeNull()
    expect(msg({ type: 'build', tile: 1 })).not.toBeNull()
    expect(msg({ type: 'bid', amount: 50 })).not.toBeNull()
    expect(msg({ type: 'proposeTrade', to: 'b', give: { cash: 10, properties: [1, 3], jailCards: 0 }, get: side })).not.toBeNull()
  })
  it('dados que no son un par de 1 a 6', () => {
    for (const dice of [0, false, null, 'x', [], [1], [1, 2, 3], [0, 7], [1.5, 2], ['a', 'b']]) {
      expect(msg({ type: 'roll', dice }), JSON.stringify(dice)).toBeNull()
      expect(msg({ type: 'orderRoll', dice }), JSON.stringify(dice)).toBeNull()
    }
  })
  it('intercambios sin give/get, con tipos raros o desmedidos', () => {
    expect(msg({ type: 'proposeTrade', to: 'b' })).toBeNull()
    expect(msg({ type: 'proposeTrade', to: 'b', give: null, get: side })).toBeNull()
    expect(msg({ type: 'proposeTrade', to: 'b', give: { cash: 1, jailCards: 0 }, get: side })).toBeNull()
    expect(msg({ type: 'proposeTrade', to: 'b', give: { cash: 1, properties: 'x', jailCards: 0 }, get: side })).toBeNull()
    expect(msg({ type: 'proposeTrade', to: 'b', give: { cash: -5, properties: [], jailCards: 0 }, get: side })).toBeNull()
    expect(msg({ type: 'proposeTrade', to: 'b', give: { cash: 1.5, properties: [], jailCards: 0 }, get: side })).toBeNull()
    expect(msg({ type: 'proposeTrade', to: 'b', give: { cash: 0, properties: [99], jailCards: 0 }, get: side })).toBeNull()
    expect(msg({ type: 'proposeTrade', to: 'b', give: { cash: 0, properties: Array(41).fill(1), jailCards: 0 }, get: side })).toBeNull()
    expect(msg({ type: 'proposeTrade', give: side, get: side })).toBeNull()
  })
  it('casillas y montos inválidos', () => {
    for (const tile of ['x', -1, 40, 1.5, null]) expect(msg({ type: 'build', tile }), String(tile)).toBeNull()
    for (const amount of ['5', -1, 1.5, NaN, null]) expect(msg({ type: 'bid', amount }), String(amount)).toBeNull()
  })
  it('el token del join se valida (16 a 100 caracteres)', () => {
    const j = (token: unknown) => parseClientMessage(JSON.stringify({ t: 'join', code: 'ABCDE', name: 'x', token }))
    expect(j('t'.repeat(20))).toMatchObject({ t: 'join', token: 't'.repeat(20) })
    expect(j('corto')).toBeNull()
    expect(j('t'.repeat(101))).toBeNull()
    expect(j(5)).toBeNull()
    expect(parseClientMessage(JSON.stringify({ t: 'join', code: 'ABCDE', name: 'x' }))).not.toBeNull() // sin token: clientes viejos
  })
})

describe('el motor tampoco se rompe con acciones mal formadas (defensa en profundidad)', () => {
  const s = createGame(['a', 'b'].map((id) => ({ id, name: id })), {}, 1)
  const run = (a: Record<string, unknown>) => applyAction(s, { player: 'a', ...a } as never, { clientDice: false })
  it('no lanza y responde con un error', () => {
    for (const a of [
      { type: 'proposeTrade', to: 'b' },
      { type: 'proposeTrade', to: 'b', give: null, get: {} },
      { type: 'proposeTrade', to: 'b', give: { cash: 1, jailCards: 0 }, get: side },
      { type: 'roll', dice: 0 },
      { type: 'roll', dice: false },
      { type: 'orderRoll', dice: 0 },
    ]) {
      const r = run(a)
      expect(r.ok, JSON.stringify(a)).toBe(false)
    }
  })
})
