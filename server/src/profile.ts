import { DurableObject } from 'cloudflare:workers'
import { sanitizeSettings } from '../../src/engine'
import type { Env } from './env'

const MAX_BODY = 4096

/**
 * Perfil de un jugador (un Durable Object por id de jugador): guarda su configuración.
 * GET devuelve `{ settings }` (null si es un perfil nuevo); PUT guarda la configuración ya validada.
 */
export class ProfileStore extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    if (req.method === 'GET') {
      const settings = (await this.ctx.storage.get('settings')) ?? null
      return Response.json({ settings })
    }
    if (req.method === 'PUT') {
      const text = await req.text()
      if (text.length > MAX_BODY) return Response.json({ error: 'Demasiado grande' }, { status: 413 })
      let body: unknown
      try {
        body = JSON.parse(text)
      } catch {
        return Response.json({ error: 'JSON inválido' }, { status: 400 })
      }
      const settings = sanitizeSettings((body as { settings?: unknown })?.settings)
      await this.ctx.storage.put('settings', settings)
      return Response.json({ settings })
    }
    return Response.json({ error: 'Método no permitido' }, { status: 405 })
  }
}
