import type { ClockView } from './clock'
import type { Room } from './lobby'
import type { Action, GameEvent } from './types'

/**
 * Mensajes entre cliente y servidor (JSON por WebSocket). El servidor es la autoridad: valida todo con
 * `parseClientMessage`, aplica las acciones con `lobby.dispatch` y reenvía el resultado a toda la sala.
 */

export const PROTOCOL_VERSION = 1

export type UiKind = 'fast' | 'closeCard'
const UI_KINDS = new Set<string>(['fast', 'closeCard'])

export type ClientMessage =
  /** `token`: el secreto del jugador (va en el mensaje y no en la URL, para que no quede en logs) */
  | { t: 'join'; code: string; name: string; avatar?: string | null; token?: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'color'; color: string }
  | { t: 'rules'; rules: Record<string, unknown> }
  | { t: 'start' }
  | { t: 'leave' }
  /** `seq`: la última versión del estado que vio el cliente (para detectar si le falta algo) */
  | { t: 'action'; action: Action; seq?: number }
  | { t: 'chat'; text: string }
  /** Gesto de pantalla que ven todos: acelerar la animación o cerrar la carta. `seq` = resultado que se está animando */
  | { t: 'ui'; kind: UiKind; seq: number }
  | { t: 'ping' }

export type ServerMessage =
  /** Estado completo de la sala (al entrar, reconectar o cambiar el lobby) */
  | { t: 'room'; room: Room; you: string; version: number; clock: ClockView | null }
  /** Resultado de una acción: los eventos para animar y el nuevo `seq`; con `room` cuando conviene resincronizar */
  /** `auto`: lo jugó el servidor por tiempo agotado (los clientes no animan cartas ni alquileres) */
  | { t: 'update'; events: GameEvent[]; seq: number; room: Room; clock: ClockView | null; auto?: boolean }
  | { t: 'ui'; kind: UiKind; seq: number; from: string }
  | { t: 'error'; error: string }
  | { t: 'chat'; from: string; text: string; at: number }
  | { t: 'pong' }

const ACTION_TYPES = new Set<string>([
  'roll', 'orderRoll', 'buy', 'decline', 'bid', 'passAuction', 'closeAuction', 'endTurn', 'payJailFine', 'useJailCard', 'bankrupt', 'drawCard',
  'proposeTrade', 'acceptTrade', 'rejectTrade', 'cancelTrade',
  'build', 'sellHouse', 'mortgage', 'unmortgage',
])

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown, max = 100): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

/** Limpia un texto de chat (largo máximo, sin saltos raros). Devuelve '' si queda vacío. */
export function sanitizeChat(text: string, max = 280): string {
  return text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

const isInt = (v: unknown, max = 1_000_000_000): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max
const isSide = (v: unknown): boolean =>
  isObj(v) && isInt(v.cash) && isInt(v.jailCards, 10) && Array.isArray(v.properties) && v.properties.length <= 40 && v.properties.every((p) => isInt(p, 39))

/** Que los campos de la acción tengan la forma y el tipo que el motor espera (el motor después valida las reglas). */
function validActionShape(a: Record<string, unknown>): boolean {
  switch (a.type) {
    case 'roll':
    case 'orderRoll':
      return a.dice === undefined || (Array.isArray(a.dice) && a.dice.length === 2 && a.dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6))
    case 'build':
    case 'sellHouse':
    case 'mortgage':
    case 'unmortgage':
      return isInt(a.tile, 39)
    case 'bid':
      return isInt(a.amount)
    case 'proposeTrade':
      return isStr(a.to) && isSide(a.give) && isSide(a.get)
    default:
      return true
  }
}

/** Convierte lo que llegó por la red en un mensaje válido, o null si no lo es. Nunca lanza. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  let m: unknown = raw
  if (typeof raw === 'string') {
    if (raw.length > 20_000) return null
    try {
      m = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!isObj(m) || typeof m.t !== 'string') return null
  switch (m.t) {
    case 'join':
      if (!isStr(m.code, 12) || !isStr(m.name, 40)) return null
      if (m.avatar != null && !isStr(m.avatar, 300)) return null
      if (m.token !== undefined && (typeof m.token !== 'string' || m.token.length < 16 || m.token.length > 100)) return null
      return { t: 'join', code: m.code.toUpperCase(), name: m.name, avatar: (m.avatar as string | null | undefined) ?? null, ...(m.token ? { token: m.token as string } : {}) }
    case 'ready':
      return typeof m.ready === 'boolean' ? { t: 'ready', ready: m.ready } : null
    case 'color':
      return isStr(m.color, 12) ? { t: 'color', color: m.color } : null
    case 'rules':
      return isObj(m.rules) ? { t: 'rules', rules: m.rules } : null
    case 'start':
    case 'leave':
    case 'ping':
      return { t: m.t }
    case 'chat': {
      if (typeof m.text !== 'string') return null
      const text = sanitizeChat(m.text)
      return text ? { t: 'chat', text } : null
    }
    case 'ui':
      if (typeof m.kind !== 'string' || !UI_KINDS.has(m.kind) || !Number.isInteger(m.seq)) return null
      return { t: 'ui', kind: m.kind as UiKind, seq: m.seq as number }
    case 'action': {
      const a = m.action
      if (!isObj(a) || typeof a.type !== 'string' || !ACTION_TYPES.has(a.type) || !isStr(a.player)) return null
      if (m.seq !== undefined && !Number.isInteger(m.seq)) return null
      if (!validActionShape(a)) return null
      return { t: 'action', action: a as unknown as Action, seq: m.seq as number | undefined }
    }
  }
  return null
}
