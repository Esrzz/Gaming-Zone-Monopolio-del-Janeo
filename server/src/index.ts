import { makeRoomCode } from '../../src/engine'
import type { Env } from './env'

export { GameRoom } from './room'

const json = (body: unknown, init: ResponseInit = {}, cors: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...cors } })

function originAllowed(req: Request, env: Env): boolean {
  const list = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const origin = req.headers.get('Origin')
  if (list.length === 0 || !origin) return true // sin lista (desarrollo) o cliente que no es un navegador
  return list.includes(origin)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const origin = req.headers.get('Origin')
    const cors: Record<string, string> = origin && originAllowed(req, env)
      ? { 'access-control-allow-origin': origin, vary: 'Origin' }
      : {}

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' } })
    }
    if (!originAllowed(req, env)) return json({ error: 'Origen no permitido' }, { status: 403 })

    if (url.pathname === '/api/health') return json({ ok: true }, {}, cors)

    // Crear sala: devuelve un código libre. La sala se crea cuando el host se conecta por WebSocket con create=1.
    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      for (let i = 0; i < 8; i++) {
        const code = makeRoomCode()
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
        const { exists } = (await (await stub.fetch('https://room/exists')).json()) as { exists: boolean }
        if (!exists) return json({ code }, {}, cors)
      }
      return json({ error: 'No se pudo generar un código, probá de nuevo' }, { status: 503 }, cors)
    }

    // WebSocket de una sala: /ws/CODIGO?token=...&create=1
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]{3,12})$/)
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'Se esperaba WebSocket' }, { status: 426 }, cors)
      const code = m[1].toUpperCase()
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
      const target = new URL('https://room/ws')
      target.searchParams.set('code', code)
      target.searchParams.set('token', url.searchParams.get('token') ?? '')
      if (url.searchParams.get('create') === '1') target.searchParams.set('create', '1')
      return stub.fetch(new Request(target, req))
    }

    return json({ error: 'No encontrado' }, { status: 404 }, cors)
  },
} satisfies ExportedHandler<Env>
