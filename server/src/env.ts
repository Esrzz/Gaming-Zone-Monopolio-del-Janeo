import type { GameRoom } from './room'
import type { ProfileStore } from './profile'

export interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>
  PROFILES: DurableObjectNamespace<ProfileStore>
  TURN_SECONDS?: string
  /** URL del stats.json del worker de stats (por defecto, gaming-zone-api) */
  STATS_URL?: string
  TRADE_SECONDS?: string
  ALLOWED_ORIGINS?: string
}
