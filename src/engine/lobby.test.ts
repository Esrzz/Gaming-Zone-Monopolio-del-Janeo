import { describe, expect, it } from 'vitest'
import {
  RECONNECT_GRACE_MS,
  abandon,
  createRoom,
  disconnect,
  dispatch,
  expiredMembers,
  joinRoom,
  leaveRoom,
  makeRoomCode,
  publicRoom,
  reconnect,
  setReady,
  setRules,
  startGame,
  whyCannotStart,
} from './lobby'
import type { Room } from './lobby'
import { parseClientMessage, sanitizeChat } from './protocol'

const must = (r: { ok: boolean; room?: Room; error?: string }): Room => {
  if (!r.ok || !r.room) throw new Error(r.error)
  return r.room
}

function lobby(n = 3): Room {
  let room = createRoom('ABCDE', { id: 'h', name: 'Host' })
  for (let i = 1; i < n; i++) {
    room = must(joinRoom(room, { id: `p${i}`, name: `Jugador ${i}` }))
    room = must(setReady(room, `p${i}`, true))
  }
  return room
}

describe('sala: lobby', () => {
  it('el host también puede marcarse como no listo, y entonces no se puede empezar', () => {
    let room = lobby(2)
    expect(room.members[0].ready).toBe(true) // arranca listo
    expect(whyCannotStart(room)).toBeNull()
    room = must(setReady(room, 'h', false))
    expect(room.members[0].ready).toBe(false)
    expect(whyCannotStart(room)).toMatch(/Host/)
    room = must(setReady(room, 'h', true))
    expect(whyCannotStart(room)).toBeNull()
  })

  it('el host elige la duración del turno (acotada) y los demás tienen que volver a confirmar', () => {
    let room = lobby(3)
    expect(room.rules.turnSeconds).toBe(240)
    room = must(setRules(room, 'h', { turnSeconds: 90 }))
    expect(room.rules.turnSeconds).toBe(90)
    expect(room.members.filter((m) => m.id !== 'h').every((m) => !m.ready)).toBe(true)
    expect(must(setRules(room, 'h', { turnSeconds: 1 })).rules.turnSeconds).toBe(15)
    expect(must(setRules(room, 'h', { turnSeconds: 99999 })).rules.turnSeconds).toBe(1800)
    expect(setRules(room, 'p1', { turnSeconds: 30 }).ok).toBe(false)
  })

  it('el host crea la sala y entran jugadores hasta 6', () => {
    let room = lobby(6)
    expect(room.members).toHaveLength(6)
    const full = joinRoom(room, { id: 'x', name: 'Otro' })
    expect(full.ok).toBe(false)
    room = must(leaveRoom(room, 'p5'))
    expect(room.members).toHaveLength(5)
  })

  it('no se repiten nombres ni ids; el mismo id solo se reconecta', () => {
    const room = lobby(2)
    expect(joinRoom(room, { id: 'zz', name: 'host' }).ok).toBe(false)
    const again = must(joinRoom(room, { id: 'p1', name: 'Otro nombre' }))
    expect(again.members).toHaveLength(2)
  })

  it('para empezar hacen falta 2+ jugadores confirmados y solo el host puede', () => {
    expect(whyCannotStart(createRoom('A', { id: 'h', name: 'Host' }))).toMatch(/al menos/)
    let room = must(joinRoom(createRoom('A', { id: 'h', name: 'Host' }), { id: 'p', name: 'P' }))
    expect(whyCannotStart(room)).toMatch(/confirmen/)
    expect(startGame(room, 'h').ok).toBe(false)
    room = must(setReady(room, 'p', true))
    expect(startGame(room, 'p').ok).toBe(false) // no es el host
    const started = must(startGame(room, 'h', 1))
    expect(started.status).toBe('playing')
    expect(started.game?.players.map((p) => p.id)).toEqual(['h', 'p'])
  })

  it('solo el host cambia las reglas (acotadas) y los demás vuelven a confirmar', () => {
    let room = lobby(3)
    expect(setRules(room, 'p1', { startingCash: 5000 }).ok).toBe(false)
    room = must(setRules(room, 'h', { startingCash: 999999999, goSalary: 300 }))
    expect(room.rules.startingCash).toBe(100000)
    expect(room.rules.goSalary).toBe(300)
    expect(room.members.find((m) => m.id === 'p1')?.ready).toBe(false)
  })

  it('si se va el host, otro pasa a serlo', () => {
    const room = must(leaveRoom(lobby(3), 'h'))
    expect(room.hostId).toBe('p1')
  })

  it('no se puede entrar a una partida empezada, pero sí reconectarse', () => {
    const room = must(startGame(lobby(2), 'h', 1))
    expect(joinRoom(room, { id: 'nuevo', name: 'Nuevo' }).ok).toBe(false)
    expect(joinRoom(room, { id: 'p1', name: 'Jugador 1' }).ok).toBe(true)
  })

  it('códigos de sala legibles', () => {
    const code = makeRoomCode()
    expect(code).toMatch(/^[A-Z2-9]{5}$/)
    expect(code).not.toMatch(/[ILO01]/)
  })
})

describe('sala: partida', () => {
  const playing = () => must(startGame(lobby(3), 'h', 11))

  it('solo se juega por uno mismo, sin dados propios y sin acciones del servidor', () => {
    const room = playing()
    expect(dispatch(room, 'p1', { type: 'roll', player: 'h' }).ok).toBe(false) // jugar por otro
    expect(dispatch(room, 'h', { type: 'roll', player: 'h', dice: [6, 6] }).ok).toBe(false) // dados propios
    expect(dispatch(room, 'h', { type: 'abandon', player: 'h' }).ok).toBe(false) // acción del servidor
    const ok = dispatch(room, 'h', { type: 'roll', player: 'h' })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.room.game?.seq).toBe(1)
      expect(ok.events.some((e) => e.type === 'rolled')).toBe(true)
    }
  })

  it('el desconectado tiene 2 minutos para volver; después pierde (sus bienes vuelven al banco)', () => {
    let room = playing()
    room = disconnect(room, 'p2', 1000)
    expect(expiredMembers(room, 1000 + RECONNECT_GRACE_MS - 1)).toEqual([])
    expect(expiredMembers(room, 1000 + RECONNECT_GRACE_MS)).toEqual(['p2'])
    // vuelve a tiempo: ya no expira
    expect(expiredMembers(reconnect(room, 'p2'), 1000 + RECONNECT_GRACE_MS * 2)).toEqual([])
    room = must(abandon(room, 'p2'))
    expect(room.game?.players.find((p) => p.id === 'p2')?.bankrupt).toBe(true)
    expect(expiredMembers(room, 1000 + RECONNECT_GRACE_MS * 2)).toEqual([]) // ya no cuenta
  })

  it('con 2 jugadores, si uno abandona la partida termina', () => {
    let room = must(startGame(lobby(2), 'h', 3))
    room = must(leaveRoom(room, 'p1'))
    expect(room.status).toBe('finished')
    expect(room.game?.winner).toBe('h')
  })

  it('al cliente no se le manda el orden de los mazos ni la semilla', () => {
    const room = playing()
    const pub = publicRoom(room)
    expect(pub.game?.rng).toBe(0)
    expect(pub.game?.decks.chest.draw.every((x) => x === '')).toBe(true)
    expect(room.game?.rng).not.toBe(0)
  })
})

describe('protocolo', () => {
  it('acepta gestos de pantalla válidos y rechaza el resto', () => {
    expect(parseClientMessage({ t: 'ui', kind: 'fast', seq: 4 })).toEqual({ t: 'ui', kind: 'fast', seq: 4 })
    expect(parseClientMessage({ t: 'ui', kind: 'closeCard', seq: 0 })).toEqual({ t: 'ui', kind: 'closeCard', seq: 0 })
    expect(parseClientMessage({ t: 'ui', kind: 'otra', seq: 1 })).toBeNull()
    expect(parseClientMessage({ t: 'ui', kind: 'fast', seq: 1.5 })).toBeNull()
    expect(parseClientMessage({ t: 'ui', kind: 'fast' })).toBeNull()
  })

  it('acepta mensajes válidos y rechaza basura sin lanzar', () => {
    expect(parseClientMessage('{"t":"join","code":"abcde","name":"Ana"}')).toMatchObject({ t: 'join', code: 'ABCDE' })
    expect(parseClientMessage({ t: 'action', action: { type: 'roll', player: 'a' } })).toMatchObject({ t: 'action' })
    expect(parseClientMessage('no es json')).toBeNull()
    expect(parseClientMessage({ t: 'action', action: { type: 'abandon', player: 'a' } })).toBeNull() // reservada al servidor
    expect(parseClientMessage({ t: 'action', action: { type: 'inventada', player: 'a' } })).toBeNull()
    expect(parseClientMessage({ t: 'join', code: '', name: 'x' })).toBeNull()
    expect(parseClientMessage(null)).toBeNull()
    expect(parseClientMessage('x'.repeat(30_000))).toBeNull()
  })

  it('limpia el chat', () => {
    expect(sanitizeChat('  hola \n\n mundo\u0000 ')).toBe('hola mundo')
    expect(sanitizeChat('a'.repeat(1000))).toHaveLength(280)
    expect(parseClientMessage({ t: 'chat', text: '   ' })).toBeNull()
  })
})
