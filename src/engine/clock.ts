import { currentPlayer } from './engine'
import type { GameState, PlayerId } from './types'

/**
 * Relojes de la partida, puros (sin timers reales): el servidor guarda este objeto y le pasa la hora (`now`, en ms).
 *
 * - Reloj de turno: corre todo el turno (tirar, comprar, gestionar…) y se reinicia al cambiar de jugador.
 * - Al abrirse un intercambio se pausa el reloj del turno y corre el de respuesta de quien lo recibe;
 *   al resolverse, el del turno sigue por donde estaba.
 */

export interface ClockConfig {
  turnMs: number
  tradeMs: number
  /** Tiempo que dura una subasta sin ofertas nuevas (cada oferta lo reinicia) */
  auctionMs?: number
}

/** Tiempo para tirar en la fase de orden de salida (nadie debería trabar el arranque 4 minutos) */
export const ORDER_ROLL_MS = 20_000

export const AUCTION_MS = 20_000

export const DEFAULT_CLOCK: ClockConfig = { turnMs: 240_000, tradeMs: 60_000, auctionMs: AUCTION_MS }

export interface Clock {
  /** Jugador al que corresponde el reloj de turno */
  player: PlayerId | null
  /** Hora en que vence el turno; null mientras está pausado por un intercambio */
  turnEndsAt: number | null
  /** Lo que le quedaba al turno cuando se pausó */
  turnPausedMs: number | null
  /** Hora en que vence la respuesta al intercambio abierto */
  tradeEndsAt: number | null
  tradeTo: PlayerId | null
  /** El reloj corrió durante la fase de orden de salida (al cambiar de fase se reinicia) */
  inOrder?: boolean
  /** Subasta abierta: hora en que vence y a qué estado corresponde (cada oferta reinicia el tiempo) */
  auctionEndsAt?: number | null
  auctionKey?: string | null
}

export const emptyClock = (): Clock => ({ player: null, turnEndsAt: null, turnPausedMs: null, tradeEndsAt: null, tradeTo: null })

/** Ajusta los relojes al estado actual del juego. Llamar después de cada cambio de estado. */
export function advanceClock(prev: Clock, game: GameState | null, now: number, cfg: ClockConfig = DEFAULT_CLOCK): Clock {
  if (!game || game.phase === 'over') return emptyClock()
  const c = { ...prev }
  const who = currentPlayer(game).id
  const inOrder = game.phase === 'order'
  if (c.player !== who || !!c.inOrder !== inOrder) {
    const turnMs = inOrder ? Math.min(cfg.turnMs, ORDER_ROLL_MS) : cfg.turnMs
    const fresh: Clock = { player: who, inOrder, turnEndsAt: now + turnMs, turnPausedMs: null, tradeEndsAt: game.trade ? now + cfg.tradeMs : null, tradeTo: game.trade?.to ?? null, auctionEndsAt: null, auctionKey: null }
    return game.auction ? withAuction(fresh, game, now, cfg) : fresh
  }
  if (game.auction || c.auctionKey) return withAuction(c, game, now, cfg)
  if (game.trade) {
    if (c.tradeEndsAt === null || c.tradeTo !== game.trade.to) {
      if (c.turnEndsAt !== null) {
        c.turnPausedMs = Math.max(0, c.turnEndsAt - now)
        c.turnEndsAt = null
      }
      c.tradeEndsAt = now + cfg.tradeMs
      c.tradeTo = game.trade.to
    }
  } else if (c.tradeEndsAt !== null) {
    c.tradeEndsAt = null
    c.tradeTo = null
    c.turnEndsAt = now + (c.turnPausedMs ?? cfg.turnMs)
    c.turnPausedMs = null
  }
  return c
}

/** Durante una subasta el reloj del turno se pausa y corre el de la subasta (se reinicia con cada oferta). */
function withAuction(prev: Clock, game: GameState, now: number, cfg: ClockConfig): Clock {
  const c = { ...prev }
  const a = game.auction
  if (!a) {
    c.auctionEndsAt = null
    c.auctionKey = null
    c.turnEndsAt = now + (c.turnPausedMs ?? cfg.turnMs)
    c.turnPausedMs = null
    return c
  }
  const key = `${a.tile}:${a.bid}:${a.leader ?? ''}`
  if (c.auctionKey !== key) {
    if (c.turnEndsAt !== null) {
      c.turnPausedMs = Math.max(0, c.turnEndsAt - now)
      c.turnEndsAt = null
    }
    c.auctionEndsAt = now + (cfg.auctionMs ?? AUCTION_MS)
    c.auctionKey = key
  }
  return c
}

/** ¿Hay que actuar por tiempo agotado? */
export function isDue(c: Clock, now: number): boolean {
  if (c.auctionEndsAt != null) return now >= c.auctionEndsAt
  if (c.tradeEndsAt !== null) return now >= c.tradeEndsAt
  return c.turnEndsAt !== null && now >= c.turnEndsAt
}

/** Próxima hora en que algún reloj vence (para programar la alarma), o null */
export function nextDeadline(c: Clock): number | null {
  const t = c.auctionEndsAt ?? c.tradeEndsAt ?? c.turnEndsAt
  return t ?? null
}

/** Lo que ve el cliente: milisegundos que quedan (evita depender de que los relojes estén sincronizados) */
export interface ClockView {
  turnMsLeft: number | null
  tradeMsLeft: number | null
  auctionMsLeft?: number | null
}

export function clockView(c: Clock, now: number): ClockView {
  return {
    turnMsLeft: c.turnEndsAt !== null ? Math.max(0, c.turnEndsAt - now) : c.turnPausedMs,
    tradeMsLeft: c.tradeEndsAt !== null ? Math.max(0, c.tradeEndsAt - now) : null,
    ...(c.auctionEndsAt != null ? { auctionMsLeft: Math.max(0, c.auctionEndsAt - now) } : {}),
  }
}
