import { makeRoomCode } from '../../src/engine'
import type { Env } from './env'
import { idFromToken } from './room'

export { GameRoom } from './room'
export { ProfileStore } from './profile'

const json = (body: unknown, init: ResponseInit = {}, cors: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...cors } })

function originAllowed(req: Request, env: Env): boolean {
  // se compara por origen (sin barra final ni ruta): 'https://sitio.com/' y 'https://sitio.com' valen igual
  const list = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    try {
      return new URL(s).origin
    } catch {
      return s
    }
  })
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
      return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS', 'access-control-allow-headers': 'content-type, authorization' } })
    }
    if (!originAllowed(req, env)) return json({ error: 'Origen no permitido' }, { status: 403 })

    if (url.pathname === '/api/health') return json({ ok: true }, {}, cors)

    // Configuración del perfil: GET devuelve la guardada (null si es un perfil nuevo), PUT la guarda.
    // Se identifica con el token secreto del jugador (Authorization: Bearer …), igual que en las salas.
    if (url.pathname === '/api/settings' && (req.method === 'GET' || req.method === 'PUT')) {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
      if (token.length < 16 || token.length > 200) return json({ error: 'Falta el token' }, { status: 401 }, cors)
      const stub = env.PROFILES.get(env.PROFILES.idFromName(await idFromToken(token)))
      const res = await stub.fetch(new Request('https://profile/settings', { method: req.method, body: req.method === 'PUT' ? await req.text() : undefined }))
      return json(await res.json(), { status: res.status }, cors)
    }

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

    // WebSocket de una sala: /ws/CODIGO?create=1 (el token secreto va en el primer mensaje `join`)
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]{3,12})$/)
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'Se esperaba WebSocket' }, { status: 426 }, cors)
      const code = m[1].toUpperCase()
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
      const target = new URL('https://room/ws')
      target.searchParams.set('code', code)
      const legacyToken = url.searchParams.get('token')
      if (legacyToken !== null) target.searchParams.set('token', legacyToken) // clientes viejos; los nuevos mandan el token en el join
      if (url.searchParams.get('create') === '1') target.searchParams.set('create', '1')
      return stub.fetch(new Request(target, req))
    }

    return json({ error: 'No encontrado' }, { status: 404 }, cors)
  },
} satisfies ExportedHandler<Env>
