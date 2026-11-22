import type { GameRoom } from './room'

export interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>
  TURN_SECONDS?: string
  TRADE_SECONDS?: string
  ALLOWED_ORIGINS?: string
}
