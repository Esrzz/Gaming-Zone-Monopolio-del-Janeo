import { DEFAULT_GAMES, STREET_COUNT } from './board'
import type { GameInfo } from './types'

/** Hosts desde los que se aceptan íconos de juegos (los que devuelve el worker de stats). */
const ICON_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net'])

function cleanIcon(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 300) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && ICON_HOSTS.has(u.hostname) ? u.toString() : null
  } catch {
    return null
  }
}

/**
 * Ranking de juegos a partir del stats.json del worker: horas = suma de `games` + `ranchoGames` de todos los
 * miembros; solo cuentan los juegos de `gameApps` (los que tienen ícono). Misma lógica que scripts/ranking.mjs.
 */
export function rankingFromStats(stats: unknown): GameInfo[] {
  const st = stats as { members?: Record<string, Record<string, Record<string, number>>>; gameApps?: Record<string, unknown>; gameIcons?: Record<string, unknown> }
  if (!st || typeof st !== 'object' || !st.gameApps || typeof st.gameApps !== 'object') return []
  const seconds: Record<string, number> = {}
  for (const m of Object.values(st.members ?? {})) {
    for (const key of ['games', 'ranchoGames']) {
      for (const [game, s] of Object.entries(m?.[key] ?? {})) {
        if (typeof s === 'number' && Number.isFinite(s)) seconds[game] = (seconds[game] ?? 0) + s
      }
    }
  }
  return Object.keys(st.gameApps)
    .map((name) => ({
      name,
      hours: Math.round(((seconds[name] ?? 0) / 3600) * 10) / 10,
      icon: cleanIcon(st.gameIcons?.[name]),
    }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name))
}

/**
 * Deja exactamente los 22 juegos que usa el tablero: valida nombres y horas, saca repetidos y, si faltan,
 * completa con el ranking de respaldo del build. Con basura o vacío devuelve el ranking de respaldo.
 */
export function sanitizeGames(input: unknown): GameInfo[] {
  const out: GameInfo[] = []
  const seen = new Set<string>()
  if (Array.isArray(input)) {
    for (const g of input) {
      const name = typeof g?.name === 'string' ? g.name.replace(/\s+/g, ' ').trim().slice(0, 60) : ''
      if (!name || seen.has(name)) continue
      seen.add(name)
      const hours = typeof g.hours === 'number' && Number.isFinite(g.hours) && g.hours >= 0 ? Math.min(g.hours, 1e6) : 0
      out.push({ name, hours, icon: cleanIcon(g.icon) })
    }
  }
  for (const d of DEFAULT_GAMES) {
    if (out.length >= STREET_COUNT) break
    if (!seen.has(d.name)) { seen.add(d.name); out.push(d) }
  }
  return out.slice(0, STREET_COUNT)
}
