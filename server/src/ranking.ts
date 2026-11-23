import { rankingFromStats, sanitizeGames } from '../../src/engine'
import type { GameInfo } from '../../src/engine'
import type { Env } from './env'

const DEFAULT_STATS_URL = 'https://gaming-zone-api.gamingzone.workers.dev/stats.json'
const TIMEOUT_MS = 3000
const CACHE_MS = 5 * 60_000

let cache: { at: number; games: GameInfo[] } | null = null

/**
 * Ranking actualizado de juegos (horas jugadas en el server) para armar el tablero de una sala nueva.
 * Si el worker de stats no responde, tarda o devuelve algo raro, devuelve undefined y la sala usa el ranking del build.
 * Se guarda en memoria 5 minutos para no consultarlo en cada sala.
 */
export async function fetchGames(env: Env): Promise<GameInfo[] | undefined> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.games
  try {
    const url = env.STATS_URL || DEFAULT_STATS_URL
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ranked = rankingFromStats(await res.json())
    if (ranked.length < 5) throw new Error(`ranking inválido (${ranked.length} juegos)`)
    const games = sanitizeGames(ranked)
    cache = { at: Date.now(), games }
    console.log(`ranking en vivo OK: #1 ${games[0].name}`)
    return games
  } catch (err) {
    console.warn('No se pudo traer el ranking, se usa el del build:', String(err))
    return undefined
  }
}
