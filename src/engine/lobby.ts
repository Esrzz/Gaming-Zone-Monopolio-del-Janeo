import { MAX_PLAYERS, MIN_PLAYERS, applyAction, createGame, isServerOnly, sanitizeRules, toPublicState } from './engine'
import { sanitizeGames } from './ranking'
import type { Action, GameEvent, GameInfo, GameState, PlayerId, Rules } from './types'

/**
 * Lógica pura de una sala de multijugador (lobby → partida → fin). No sabe nada de red ni de reloj:
 * el servidor (un Durable Object de Cloudflare, por ejemplo) guarda el `Room` como JSON, le pasa la hora
 * (`now`) a las funciones que la necesitan y reenvía a los clientes lo que devuelven.
 */

/** Tiempo que un jugador desconectado tiene para volver antes de perder la partida (como pidió el diseño: 2 minutos) */
export const RECONNECT_GRACE_MS = 2 * 60 * 1000

export interface Member {
  id: PlayerId
  name: string
  avatar: string | null
  ready: boolean
  connected: boolean
  /** Cuándo se desconectó (ms); null si está conectado */
  disconnectedAt: number | null
}

export type RoomStatus = 'lobby' | 'playing' | 'finished'

export interface Room {
  code: string
  hostId: PlayerId
  status: RoomStatus
  members: Member[]
  rules: Rules
  /** Ranking de juegos con el que se arma el tablero (lo trae el servidor al crear la sala; sin él, el del build) */
  games?: GameInfo[]
  /** Hay partida cuando status es 'playing' o 'finished' */
  game: GameState | null
}

type Ok = { ok: true; room: Room; events: GameEvent[] }
type Fail = { ok: false; error: string }
export type RoomResult = Ok | Fail

const fail = (error: string): Fail => ({ ok: false, error })
const ok = (room: Room, events: GameEvent[] = []): Ok => ({ ok: true, room, events })

const clone = (r: Room): Room => structuredClone(r)
const cleanName = (n: string) => n.replace(/\s+/g, ' ').trim().slice(0, 24)

/** Código de sala legible (sin letras que se confunden). `random` se inyecta para poder testear. */
export function makeRoomCode(random: () => number = Math.random, length = 5): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('')
}

export function createRoom(code: string, host: { id: PlayerId; name: string; avatar?: string | null }, games?: GameInfo[]): Room {
  return {
    ...(games ? { games: sanitizeGames(games) } : {}),
    code,
    hostId: host.id,
    status: 'lobby',
    members: [{ id: host.id, name: cleanName(host.name) || 'Jugador', avatar: host.avatar ?? null, ready: true, connected: true, disconnectedAt: null }],
    rules: sanitizeRules(),
    game: null,
  }
}

/** Entrar a la sala. Si el id ya estaba (se desconectó y vuelve), simplemente se reconecta. */
export function joinRoom(room: Room, who: { id: PlayerId; name: string; avatar?: string | null }): RoomResult {
  const r = clone(room)
  const existing = r.members.find((m) => m.id === who.id)
  if (existing) {
    existing.connected = true
    existing.disconnectedAt = null
    return ok(r)
  }
  if (r.status !== 'lobby') return fail('La partida ya empezó')
  if (r.members.length >= MAX_PLAYERS) return fail('La sala está llena')
  const name = cleanName(who.name)
  if (!name) return fail('Falta el nombre')
  if (r.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) return fail('Ya hay alguien con ese nombre')
  r.members.push({ id: who.id, name, avatar: who.avatar ?? null, ready: false, connected: true, disconnectedAt: null })
  return ok(r)
}

/** Salir por decisión propia. En el lobby se va sin más; en partida cuenta como abandono. */
export function leaveRoom(room: Room, id: PlayerId): RoomResult {
  if (!room.members.some((m) => m.id === id)) return fail('No estás en la sala')
  if (room.status === 'playing') return abandon(room, id)
  const r = clone(room)
  r.members = r.members.filter((m) => m.id !== id)
  if (r.hostId === id && r.members.length > 0) {
    r.hostId = r.members[0].id
    r.members[0].ready = true
  }
  return ok(r)
}

export function setReady(room: Room, id: PlayerId, ready: boolean): RoomResult {
  if (room.status !== 'lobby') return fail('La partida ya empezó')
  const r = clone(room)
  const m = r.members.find((x) => x.id === id)
  if (!m) return fail('No estás en la sala')
  m.ready = ready
  return ok(r)
}

/** Solo el host y solo antes de empezar. Las reglas se acotan con `sanitizeRules`. */
export function setRules(room: Room, requester: PlayerId, rules: Partial<Rules>): RoomResult {
  if (room.status !== 'lobby') return fail('La partida ya empezó')
  if (room.hostId !== requester) return fail('Solo el host puede cambiar las reglas')
  const r = clone(room)
  r.rules = sanitizeRules({ ...r.rules, ...rules })
  for (const m of r.members) if (m.id !== r.hostId) m.ready = false // al cambiar las reglas hay que volver a confirmar
  return ok(r)
}

/** Motivo por el que todavía no se puede empezar (null = se puede). */
export function whyCannotStart(room: Room): string | null {
  if (room.status !== 'lobby') return 'La partida ya empezó'
  if (room.members.length < MIN_PLAYERS) return `Hacen falta al menos ${MIN_PLAYERS} jugadores`
  if (room.members.some((m) => !m.connected)) return 'Hay jugadores desconectados'
  const waiting = room.members.filter((m) => !m.ready)
  if (waiting.length) return `Falta que confirmen: ${waiting.map((m) => m.name).join(', ')}`
  return null
}

/** El host empieza la partida. `seed` (opcional) la hace reproducible; el servidor suele dejar que sea al azar. */
export function startGame(room: Room, requester: PlayerId, seed?: number): RoomResult {
  if (room.hostId !== requester) return fail('Solo el host puede empezar la partida')
  const why = whyCannotStart(room)
  if (why) return fail(why)
  const r = clone(room)
  r.game = createGame(
    r.members.map((m) => ({ id: m.id, name: m.name })),
    r.rules,
    seed ?? Math.random,
    r.games,
  )
  r.status = 'playing'
  return ok(r)
}

/**
 * Una acción de un jugador. Se verifica que sea suyo (`action.player`), que no sea una acción reservada al
 * servidor y que los dados no los mande el cliente.
 */
export function dispatch(room: Room, memberId: PlayerId, action: Action): RoomResult {
  if (room.status !== 'playing' || !room.game) return fail('No hay una partida en curso')
  if (!room.members.some((m) => m.id === memberId)) return fail('No estás en la sala')
  if (action.player !== memberId) return fail('No podés jugar por otro')
  if (isServerOnly(action)) return fail('Acción no permitida')
  return applyToGame(room, action)
}

/** Acciones que decide el servidor (tiempo agotado, abandono): sin las restricciones de un cliente. */
export function applyToGame(room: Room, action: Action): RoomResult {
  if (room.status !== 'playing' || !room.game) return fail('No hay una partida en curso')
  const res = applyAction(room.game, action, { clientDice: false })
  if (!res.ok) return fail(res.error)
  const r = clone(room)
  r.game = res.state
  if (res.state.phase === 'over') r.status = 'finished'
  return ok(r, res.events)
}

/** Marca a un jugador como desconectado (se le empieza a contar el tiempo para volver). */
export function disconnect(room: Room, id: PlayerId, now: number): Room {
  const r = clone(room)
  const m = r.members.find((x) => x.id === id)
  if (m && m.connected) {
    m.connected = false
    m.disconnectedAt = now
  }
  return r
}

export function reconnect(room: Room, id: PlayerId): Room {
  const r = clone(room)
  const m = r.members.find((x) => x.id === id)
  if (m) {
    m.connected = true
    m.disconnectedAt = null
  }
  return r
}

/** Jugadores en partida que llevan desconectados más que el tiempo de gracia: el servidor les aplica `abandon`. */
export function expiredMembers(room: Room, now: number, graceMs = RECONNECT_GRACE_MS): PlayerId[] {
  if (room.status !== 'playing' || !room.game) return []
  const game = room.game
  return room.members
    .filter((m) => !m.connected && m.disconnectedAt !== null && now - m.disconnectedAt >= graceMs)
    .filter((m) => !game.players.find((p) => p.id === m.id)?.bankrupt)
    .map((m) => m.id)
}

/** El jugador pierde (por irse o por no volver): sus bienes vuelven al banco. */
export function abandon(room: Room, id: PlayerId): RoomResult {
  return applyToGame(room, { type: 'abandon', player: id })
}

/** Lo que se le manda a un cliente: la sala con el estado de juego sin información privada (mazos, semilla). */
export function publicRoom(room: Room): Room {
  return { ...room, game: room.game ? toPublicState(room.game) : null }
}
