import type { ClientMessage, ServerMessage } from '../engine'

/** URL del servidor (Worker de Cloudflare). En local se puede apuntar a `wrangler dev` con VITE_SERVER_URL=http://localhost:8787 */
export const SERVER_URL: string = (import.meta.env.VITE_SERVER_URL as string | undefined) || 'https://gaming-zone-monopolio.gamingzone.workers.dev'

const TOKEN_KEY = 'gz-token'
const ROOM_KEY = 'gz-room'

/** Secreto del jugador: lo genera el navegador, lo guarda y lo manda al servidor. Con él se reconecta con la misma identidad. */
export function getToken(): string {
  try {
    let t = localStorage.getItem(TOKEN_KEY)
    if (!t || t.length < 16) {
      t = crypto.randomUUID() + crypto.randomUUID().slice(0, 8)
      localStorage.setItem(TOKEN_KEY, t)
    }
    return t
  } catch {
    return crypto.randomUUID() + crypto.randomUUID().slice(0, 8)
  }
}

/** Última sala en la que estuviste (para volver después de recargar la página). */
export const lastRoom = {
  get: (): string | null => {
    try {
      return sessionStorage.getItem(ROOM_KEY)
    } catch {
      return null
    }
  },
  set: (code: string) => {
    try {
      sessionStorage.setItem(ROOM_KEY, code)
    } catch {
      /* sin almacenamiento */
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(ROOM_KEY)
    } catch {
      /* sin almacenamiento */
    }
  },
}

/** Pide al servidor un código de sala libre. */
export async function requestRoomCode(): Promise<string> {
  const res = await fetch(`${SERVER_URL}/api/rooms`, { method: 'POST' })
  const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string }
  if (!res.ok || !data.code) throw new Error(data.error || 'No se pudo crear la sala')
  return data.code
}

export type NetStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface RoomClientOptions {
  code: string
  create: boolean
  name: string
  avatar: string | null
  onMessage: (m: ServerMessage) => void
  onStatus: (s: NetStatus) => void
  /** Error fatal (la sala no existe, te desconectaron desde otro lado…): no se reintenta */
  onFatal: (error: string) => void
}

/** Conexión WebSocket a una sala, con reconexión automática (el servidor te reconoce por el token). */
export class RoomClient {
  private ws: WebSocket | null = null
  private tries = 0
  private stopped = false
  private joined = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private ping: ReturnType<typeof setInterval> | null = null

  constructor(private o: RoomClientOptions) {
    this.open()
  }

  private open() {
    if (this.stopped) return
    this.o.onStatus(this.tries === 0 ? 'connecting' : 'reconnecting')
    const wsUrl = SERVER_URL.replace(/^http/, 'ws')
    // create=1 solo la primera vez: si la conexión se cae y la sala ya existe, se entra como cualquiera
    const create = this.o.create && !this.joined
    let ws: WebSocket
    try {
      ws = new WebSocket(`${wsUrl}/ws/${this.o.code}${create ? '?create=1' : ''}`)
    } catch {
      return this.retry()
    }
    this.ws = ws
    ws.onopen = () => {
      this.tries = 0
      ws.send(JSON.stringify({ t: 'join', code: this.o.code, name: this.o.name, avatar: this.o.avatar, token: getToken() } satisfies ClientMessage))
      this.ping = setInterval(() => this.send({ t: 'ping' }), 25_000)
    }
    ws.onmessage = (e) => {
      let m: ServerMessage
      try {
        m = JSON.parse(String(e.data)) as ServerMessage
      } catch {
        return
      }
      if (m.t === 'room') {
        this.joined = true
        this.o.onStatus('open')
      }
      if (m.t === 'error' && !this.joined) {
        // un error antes de entrar a la sala (no existe, está llena, ya empezó…) no tiene sentido reintentarlo
        this.stop()
        return this.o.onFatal(m.error)
      }
      this.o.onMessage(m)
    }
    ws.onclose = (e) => {
      if (this.ping) clearInterval(this.ping)
      this.ping = null
      if (this.ws !== ws || this.stopped) return
      if (e.code === 4000) {
        this.stop()
        return this.o.onFatal('Te conectaste desde otra pestaña o dispositivo')
      }
      this.retry()
    }
    ws.onerror = () => {
      /* el cierre llega por onclose */
    }
  }

  private retry() {
    if (this.stopped) return
    this.tries += 1
    this.o.onStatus('reconnecting')
    if (this.tries > 12) {
      this.stop()
      return this.o.onFatal('No se pudo reconectar con el servidor')
    }
    this.timer = setTimeout(() => this.open(), Math.min(5000, 500 * 2 ** (this.tries - 1)))
  }

  send(m: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(m))
    return true
  }

  /** Cierra la conexión sin avisar al servidor (seguís en la sala y tenés 2 min para volver). */
  stop() {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    if (this.ping) clearInterval(this.ping)
    this.o.onStatus('closed')
    try {
      this.ws?.close(1000)
    } catch {
      /* ya cerrado */
    }
  }
}
