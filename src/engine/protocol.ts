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
  | { t: 'join'; code: string; name: string; avatar?: string | null }
  | { t: 'ready'; ready: boolean }
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
  'roll', 'buy', 'decline', 'endTurn', 'payJailFine', 'useJailCard', 'bankrupt', 'drawCard',
  'proposeTrade', 'acceptTrade', 'rejectTrade', 'cancelTrade',
  'build', 'sellHouse', 'mortgage', 'unmortgage',
])

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown, max = 100): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

/** Limpia un texto de chat (largo máximo, sin saltos raros). Devuelve '' si queda vacío. */
export function sanitizeChat(text: string, max = 280): string {
  return text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
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
      return { t: 'join', code: m.code.toUpperCase(), name: m.name, avatar: (m.avatar as string | null | undefined) ?? null }
    case 'ready':
      return typeof m.ready === 'boolean' ? { t: 'ready', ready: m.ready } : null
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
      return { t: 'action', action: a as unknown as Action, seq: m.seq as number | undefined }
    }
  }
  return null
}
