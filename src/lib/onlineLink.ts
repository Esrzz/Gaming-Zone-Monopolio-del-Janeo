import type { ReactNode } from 'react'
import type { Action, ClockView, GameEvent, GameState } from '../engine'
import type { NetStatus } from './net'

/** Lo que el servidor le avisa a la pantalla de juego */
export type NetUpdate =
  /** Resultado de una acción (de cualquiera): estado nuevo + eventos para animar */
  | { kind: 'update'; state: GameState; events: GameEvent[] }
  /** Estado completo (al entrar o reconectar), sin animación */
  | { kind: 'sync'; state: GameState }
  /** Relojes del servidor (ms restantes) */
  | { kind: 'clock'; clock: ClockView | null }
  | { kind: 'error'; error: string }

/** Conexión entre la pantalla de juego y el servidor (la pantalla de juego no sabe nada de WebSockets). */
export interface OnlineLink {
  you: string
  initial: GameState
  send: (action: Action) => boolean
  subscribe: (listener: (u: NetUpdate) => void) => () => void
  /** ids de jugadores sin conexión */
  offline: string[]
  status: NetStatus
  /** Panel extra en la barra lateral (chat) */
  sidebar?: ReactNode
}
