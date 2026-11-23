import type { GameRoom } from './room'

export interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>
  TURN_SECONDS?: string
  /** URL del stats.json del worker de stats (por defecto, gaming-zone-api) */
  STATS_URL?: string
  TRADE_SECONDS?: string
  ALLOWED_ORIGINS?: string
}
