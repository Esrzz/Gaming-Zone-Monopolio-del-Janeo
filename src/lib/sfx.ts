import { loadManifest } from './audioManifest'

/** Nombres de las carpetas de `public/audio/Efectos`. */
export type SfxName =
  | 'Cardbought'
  | 'Dados'
  | 'Jail'
  | 'Lose'
  | 'Slice'
  | 'Victory'
  | 'cardtaken'
  | 'click'
  | 'moneycollected'
  | 'moneypaid'
  | 'neg'
  | 'timerout'

export interface SfxHandle {
  /** Resuelve cuando el sonido termina, se corta o no puede reproducirse. */
  ended: Promise<void>
  /** Corta el sonido; con `fadeMs` baja el volumen antes de cortar (evita el "clic" de un corte seco). */
  stop: (fadeMs?: number) => void
}

let volume = 0.7
let muted = false
let sfx: Record<string, string[]> = {}
const durations = new Map<string, number>()
const playing = new Set<HTMLAudioElement>()
const lastPick = new Map<string, number>()
const lastAt = new Map<string, number>()

const ready = loadManifest().then((m) => {
  sfx = m.sfx
  // Precarga metadatos para conocer las duraciones (dados, cuenta regresiva…)
  for (const urls of Object.values(sfx)) for (const u of urls) void probe(u)
})

function probe(u: string): Promise<number> {
  return new Promise((resolve) => {
    const known = durations.get(u)
    if (known !== undefined) return resolve(known)
    const a = new Audio()
    a.preload = 'metadata'
    const done = (d: number) => {
      durations.set(u, d)
      resolve(d)
    }
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : 0)
    a.onerror = () => done(0)
    a.src = u
  })
}

export function setSfxVolume(v: number) {
  volume = v
  for (const a of playing) a.volume = v
}

export function setSfxMuted(m: boolean) {
  muted = m
}

/** Duración ya conocida (s) de la primera variante de un efecto; 0 si todavía no cargó. */
export function knownDuration(name: SfxName, variant = 0): number {
  const u = sfx[name]?.[variant]
  return (u && durations.get(u)) || 0
}

/** Variantes disponibles de un efecto. */
export function variants(name: SfxName): string[] {
  return sfx[name] ?? []
}

/** Duración (s) de la variante indicada; 0 si no se conoce todavía. */
export async function durationOf(name: SfxName, variant = 0): Promise<number> {
  await ready
  const u = variants(name)[variant]
  return u ? probe(u) : 0
}

const NOOP: SfxHandle = { ended: Promise.resolve(), stop: () => {} }

/**
 * Reproduce un efecto. Si hay varias variantes elige una al azar (sin repetir la última),
 * salvo que se pida una en concreto con `variant`.
 */
export function play(
  name: SfxName,
  opts: { variant?: number; /** velocidad (1 = normal); acelera o frena el sonido sin cambiar el tono */ rate?: number; /** segundo del audio desde el que arranca */ startAt?: number } = {},
): SfxHandle {
  const list = variants(name)
  if (!list.length || muted) return NOOP
  // Evita que varios eventos seguidos (p. ej. cobrar a 3 jugadores) apilen el mismo sonido
  const now = performance.now()
  if (opts.variant === undefined && now - (lastAt.get(name) ?? -1e9) < 120) return NOOP
  lastAt.set(name, now)
  let i = opts.variant ?? Math.floor(Math.random() * list.length)
  if (opts.variant === undefined && list.length > 1 && i === lastPick.get(name)) i = (i + 1) % list.length
  lastPick.set(name, i)

  const a = new Audio(list[i])
  a.volume = volume
  if (opts.rate && opts.rate !== 1) {
    a.preservesPitch = true
    a.playbackRate = opts.rate
  }
  if (opts.startAt && opts.startAt > 0) a.currentTime = opts.startAt
  playing.add(a)
  let finish: () => void = () => {}
  const ended = new Promise<void>((resolve) => {
    finish = () => {
      playing.delete(a)
      resolve()
    }
  })
  a.onended = finish
  a.onerror = finish
  a.play().catch(finish) // autoplay bloqueado: no se queda esperando
  return {
    ended,
    stop: (fadeMs = 0) => {
      if (fadeMs <= 0) {
        a.pause()
        finish()
        return
      }
      const from = a.volume
      const t0 = performance.now()
      const iv = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / fadeMs)
        a.volume = from * (1 - k)
        if (k >= 1) {
          clearInterval(iv)
          a.pause()
          finish()
        }
      }, 16)
    },
  }
}

/** Espera a que el manifest esté cargado (útil antes de pedir duraciones). */
export const sfxReady = () => ready
