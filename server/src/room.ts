import { DurableObject } from 'cloudflare:workers'
import {
  RECONNECT_GRACE_MS,
  abandon,
  advanceClock,
  applyToGame,
  clockView,
  createRoom,
  currentPlayer,
  dispatch,
  emptyClock,
  expiredMembers,
  isDue,
  joinRoom,
  leaveRoom,
  nextDeadline,
  parseClientMessage,
  publicRoom,
  reconnect,
  sanitizeRules,
  disconnect,
  setColor,
  setReady,
  setRules,
  startGame,
  timeoutAction,
} from '../../src/engine'
import type { Clock, ClockConfig, ClientMessage, GameEvent, Room, Rules, ServerMessage } from '../../src/engine'
import type { Env } from './env'
import { fetchGames } from './ranking'

/** En el lobby, un desconectado se saca a los 30 s (en partida rige RECONNECT_GRACE_MS = 2 min) */
const LOBBY_GRACE_MS = 30_000
/** Salas terminadas o vacías se borran pasado este tiempo */
const FINISHED_TTL_MS = 10 * 60_000
const IDLE_TTL_MS = 30 * 60_000
const MAX_AUTO_STEPS = 40
const CHAT_MIN_GAP_MS = 400
const RATE_WINDOW_MS = 2_000
const RATE_MAX = 25
/** Solo se aceptan avatares de estos sitios (evita que alguien meta una URL que rastree a los demás) */
const AVATAR_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net', 'gaming-zone-api.gamingzone.workers.dev'])

interface Stored {
  room: Room
  clock: Clock
  version: number
  finishedAt: number | null
}

interface Attach {
  /** Id público del jugador ('' hasta que manda su token en el join) */
  id: string
  /** Id al azar de esta conexión (para limitar mensajes antes de saber quién es) */
  cid: string
  code: string
  create: boolean
  joined: boolean
}

function cleanAvatar(a: string | null | undefined): string | null {
  if (!a) return null
  try {
    const u = new URL(a)
    return u.protocol === 'https:' && AVATAR_HOSTS.has(u.hostname) ? u.toString() : null
  } catch {
    return null
  }
}

/** El id público del jugador sale de un hash de su token secreto: nadie puede hacerse pasar por otro con solo ver el id. */
export async function idFromToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return 'p' + [...new Uint8Array(buf).slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Una sala = un Durable Object (el nombre es el código). Guarda el `Room` y los relojes, y programa alarmas. */
export class GameRoom extends DurableObject<Env> {
  private st: Stored | null = null
  private touchedAt = Date.now()
  private lastChat = new Map<string, number>()
  private rate = new Map<string, { start: number; n: number }>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(async () => {
      this.st = (await ctx.storage.get<Stored>('st')) ?? null
    })
  }

  private get cfg(): ClockConfig {
    const secs = (v: string | undefined, d: number) => (v && Number(v) > 0 ? Number(v) : d)
    // el turno lo fija el host en las reglas de la sala; TURN_SECONDS (wrangler.toml) es solo el valor inicial
    return { turnMs: (this.st?.room.rules.turnSeconds ?? secs(this.env.TURN_SECONDS, 240)) * 1000, tradeMs: secs(this.env.TRADE_SECONDS, 60) * 1000 }
  }

  // ── Conexión ────────────────────────────────────────────────────────────────

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/exists') return Response.json({ exists: this.st !== null })
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Se esperaba WebSocket', { status: 426 })

    // el token va en el mensaje `join` (así no queda en logs); por la URL se sigue aceptando para clientes viejos
    const token = url.searchParams.get('token')
    if (token !== null && (token.length < 16 || token.length > 100)) return new Response('Token inválido', { status: 400 })
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server)
    const att: Attach = { id: token ? await idFromToken(token) : '', cid: crypto.randomUUID(), code: url.searchParams.get('code') ?? '', create: url.searchParams.get('create') === '1', joined: false }
    server.serializeAttachment(att)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    this.touchedAt = Date.now()
    const att = ws.deserializeAttachment() as Attach | null
    if (!att) return
    if (typeof data !== 'string') return this.send(ws, { t: 'error', error: 'Mensaje inválido' })
    if (this.limited(att.id || att.cid)) return this.send(ws, { t: 'error', error: 'Demasiados mensajes, más despacio' })
    const msg = parseClientMessage(data)
    if (!msg) return this.send(ws, { t: 'error', error: 'Mensaje inválido' })
    if (msg.t === 'ping') return this.send(ws, { t: 'pong' })
    // Nada de lo que mande un cliente tiene que tumbar la sala: cualquier excepción inesperada se registra y se le avisa a ese cliente
    try {
      if (msg.t === 'join') {
        let who = att
        if (msg.token) who = { ...att, id: await idFromToken(msg.token) }
        if (!who.id) return this.send(ws, { t: 'error', error: 'Token inválido' })
        if (who !== att) ws.serializeAttachment(who)
        return await this.onJoin(ws, who, msg)
      }
      if (!att.joined || !this.st) return this.send(ws, { t: 'error', error: 'Primero unite a una sala' })
      await this.onMessage(ws, att, msg)
    } catch (err) {
      console.error('Error procesando un mensaje:', msg.t, String(err))
      this.send(ws, { t: 'error', error: 'Error interno, probá de nuevo' })
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye')
    } catch {
      /* ya cerrado */
    }
    await this.onGone(ws)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.onGone(ws)
  }

  private async onGone(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attach | null
    if (!att?.joined || !this.st) return
    if (this.socketsOf(att.id).some((w) => w !== ws)) return // sigue conectado desde otro lado
    await this.commit(disconnect(this.st.room, att.id, Date.now()))
  }

  // ── Mensajes ────────────────────────────────────────────────────────────────

  private async onJoin(ws: WebSocket, att: Attach, msg: Extract<ClientMessage, { t: 'join' }>): Promise<void> {
    if (att.joined) return this.send(ws, { t: 'error', error: 'Ya estás en la sala' })
    if (msg.code !== att.code) return this.send(ws, { t: 'error', error: 'Código de sala incorrecto' })
    const who = { id: att.id, name: msg.name, avatar: cleanAvatar(msg.avatar) }
    const now = Date.now()

    // se pide el ranking antes de decidir si hay que crear la sala: así no hay un await en medio (otro mensaje podría colarse)
    const games = !this.st && att.create ? await fetchGames(this.env) : undefined
    let room: Room
    if (!this.st) {
      if (!att.create) return this.send(ws, { t: 'error', error: 'Esa sala no existe' })
      room = createRoom(att.code, who, games)
      const turn = Number(this.env.TURN_SECONDS)
      if (turn > 0) room = { ...room, rules: sanitizeRules({ ...room.rules, turnSeconds: turn }) }
      this.st = { room, clock: emptyClock(), version: 0, finishedAt: null }
    } else {
      const r = joinRoom(this.st.room, who)
      if (!r.ok) return this.send(ws, { t: 'error', error: r.error })
      room = reconnect(r.room, att.id)
    }

    // si el mismo jugador estaba conectado desde otra pestaña, se cierra la vieja
    for (const w of this.socketsOf(att.id)) {
      const a = w.deserializeAttachment() as Attach
      w.serializeAttachment({ ...a, joined: false })
      try {
        w.close(4000, 'Te conectaste desde otro lugar')
      } catch {
        /* ya cerrado */
      }
    }
    ws.serializeAttachment({ ...att, joined: true })
    this.touchedAt = now
    await this.commit(room)
  }

  private async onMessage(ws: WebSocket, att: Attach, msg: Exclude<ClientMessage, { t: 'join' | 'ping' }>): Promise<void> {
    const st = this.st!
    const now = Date.now()
    const answer = async (r: { ok: true; room: Room; events: GameEvent[] } | { ok: false; error: string }, withEvents = false) => {
      if (!r.ok) return this.send(ws, { t: 'error', error: r.error })
      await this.commit(r.room, withEvents ? r.events : undefined)
    }

    switch (msg.t) {
      case 'ready':
        return answer(setReady(st.room, att.id, msg.ready))
      case 'color':
        return answer(setColor(st.room, att.id, msg.color))
      case 'rules':
        return answer(setRules(st.room, att.id, msg.rules as Partial<Rules>))
      case 'start': {
        const seed = crypto.getRandomValues(new Uint32Array(1))[0]
        return answer(startGame(st.room, att.id, seed))
      }
      case 'leave': {
        const r = leaveRoom(st.room, att.id)
        if (!r.ok) return this.send(ws, { t: 'error', error: r.error })
        ws.serializeAttachment({ ...att, joined: false })
        try {
          ws.close(1000, 'Saliste de la sala')
        } catch {
          /* ya cerrado */
        }
        return this.commit(r.room, r.events.length ? r.events : undefined)
      }
      case 'action':
        return answer(dispatch(st.room, att.id, msg.action), true)
      case 'ui':
        // gestos de pantalla: se reenvían a los demás (el que lo hizo ya lo aplicó); solo en partida
        if (st.room.status !== 'playing' || !st.room.game) return
        // acelerar / cerrar cartas es solo del dueño del turno: los demás no pueden apurar la animación de los otros
        if (currentPlayer(st.room.game).id !== att.id) return
        return this.broadcast({ t: 'ui', kind: msg.kind, seq: msg.seq, from: att.id }, ws)
      case 'chat': {
        if (now - (this.lastChat.get(att.id) ?? 0) < CHAT_MIN_GAP_MS) return
        this.lastChat.set(att.id, now)
        const from = st.room.members.find((m) => m.id === att.id)?.name ?? '?'
        return this.broadcast({ t: 'chat', from, text: msg.text, at: now })
      }
    }
  }

  // ── Estado, difusión y alarmas ──────────────────────────────────────────────

  /** Guarda la sala nueva, ajusta los relojes, programa la alarma y avisa a todos. */
  private async commit(room: Room, events?: GameEvent[], auto = false): Promise<void> {
    const st = this.st!
    const now = Date.now()
    st.room = room
    st.clock = advanceClock(st.clock, room.status === 'playing' ? room.game : null, now, this.cfg)
    if (room.status === 'finished' && st.finishedAt === null) st.finishedAt = now
    st.version += 1
    if (room.members.length === 0) return this.destroy()
    await this.ctx.storage.put('st', st)
    await this.schedule()
    this.broadcastState(events, auto)
  }

  private broadcastState(events?: GameEvent[], auto = false): void {
    const st = this.st
    if (!st) return
    const pub = publicRoom(st.room)
    const clock = st.room.status === 'playing' ? clockView(st.clock, Date.now()) : null
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attach | null
      if (!a?.joined) continue
      this.send(ws, events ? { t: 'update', events, seq: st.room.game?.seq ?? 0, room: pub, clock, ...(auto ? { auto: true } : {}) } : { t: 'room', room: pub, you: a.id, version: st.version, clock })
    }
  }

  private broadcast(msg: ServerMessage, except?: WebSocket): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except && (ws.deserializeAttachment() as Attach | null)?.joined) this.send(ws, msg)
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      /* conexión caída: el cierre lo maneja webSocketClose */
    }
  }

  private socketsOf(id: string): WebSocket[] {
    return this.ctx.getWebSockets().filter((w) => {
      const a = w.deserializeAttachment() as Attach | null
      return a?.joined && a.id === id
    })
  }

  private limited(id: string): boolean {
    const now = Date.now()
    const r = this.rate.get(id)
    if (!r || now - r.start > RATE_WINDOW_MS) {
      this.rate.set(id, { start: now, n: 1 })
      return false
    }
    r.n += 1
    return r.n > RATE_MAX
  }

  private async destroy(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, 'La sala se cerró')
      } catch {
        /* ya cerrado */
      }
    }
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
    this.st = null
  }

  /** Próxima alarma: reloj de turno/intercambio, fin de gracia de desconectados y limpieza de salas muertas. */
  private async schedule(): Promise<void> {
    const st = this.st
    if (!st) return
    const times: number[] = []
    const { room } = st
    if (room.status === 'playing') {
      const d = nextDeadline(st.clock)
      if (d !== null) times.push(d)
    }
    const grace = room.status === 'playing' ? RECONNECT_GRACE_MS : LOBBY_GRACE_MS
    if (room.status !== 'finished') for (const m of room.members) if (!m.connected && m.disconnectedAt !== null) times.push(m.disconnectedAt + grace)
    times.push(st.finishedAt !== null ? st.finishedAt + FINISHED_TTL_MS : this.touchedAt + IDLE_TTL_MS)
    await this.ctx.storage.setAlarm(Math.max(Math.min(...times), Date.now() + 50))
  }

  async alarm(): Promise<void> {
    const st = this.st
    if (!st) return
    const now = Date.now()
    let room = st.room
    const events: GameEvent[] = []
    let changed = false
    let auto = false

    // 1) Tiempo agotado: el motor decide la acción automática (y se encadena hasta pasar el turno)
    for (let i = 0; i < MAX_AUTO_STEPS && room.status === 'playing' && room.game && isDue(st.clock, now); i++) {
      const act = timeoutAction(room.game)
      if (!act) break
      const r = applyToGame(room, act)
      if (!r.ok) break
      room = r.room
      events.push(...r.events)
      changed = true
      auto = true
      st.clock = advanceClock(st.clock, room.status === 'playing' ? room.game : null, now, this.cfg)
    }
    if (room.status === 'playing' && isDue(st.clock, now)) {
      // no se pudo avanzar: se reintenta más tarde en vez de girar en falso
      st.clock = { ...st.clock, turnEndsAt: st.clock.turnEndsAt === null ? null : now + 10_000, tradeEndsAt: st.clock.tradeEndsAt === null ? null : now + 10_000, auctionEndsAt: st.clock.auctionEndsAt == null ? null : now + 10_000 }
    }

    // 2) Desconectados que no volvieron a tiempo
    if (room.status === 'playing') {
      for (const id of expiredMembers(room, now)) {
        const r = abandon(room, id)
        if (r.ok) {
          room = r.room
          events.push(...r.events)
          changed = true
        }
      }
    } else if (room.status === 'lobby') {
      for (const m of room.members.filter((x) => !x.connected && x.disconnectedAt !== null && now - x.disconnectedAt >= LOBBY_GRACE_MS)) {
        const r = leaveRoom(room, m.id)
        if (r.ok) {
          room = r.room
          changed = true
        }
      }
    }

    if (changed) {
      await this.commit(room, events.length ? events : undefined, auto)
      if (!this.st) return
    }

    // 3) Limpieza de salas terminadas o abandonadas
    const anyone = this.ctx.getWebSockets().some((w) => (w.deserializeAttachment() as Attach | null)?.joined)
    const dead = st.finishedAt !== null ? now - st.finishedAt >= FINISHED_TTL_MS : now - this.touchedAt >= IDLE_TTL_MS
    if (dead && !anyone) return this.destroy()
    if (dead) this.touchedAt = now
    await this.ctx.storage.put('st', st)
    await this.schedule()
  }
}
