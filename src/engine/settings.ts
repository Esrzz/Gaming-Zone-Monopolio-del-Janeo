/**
 * Configuración del jugador: valores por defecto y validación. Es lo único que guarda el perfil en el servidor,
 * y se valida con la misma función en el cliente (al cargar) y en el servidor (al guardar).
 */

export type HotkeyAction = 'fast' | 'roll' | 'accept' | 'reject' | 'manage' | 'trade'

export const HOTKEY_ACTIONS: { id: HotkeyAction; label: string }[] = [
  { id: 'fast', label: 'Acelerar acción' },
  { id: 'roll', label: 'Tirar dados' },
  { id: 'accept', label: 'Aceptar oferta' },
  { id: 'reject', label: 'Rechazar oferta' },
  { id: 'manage', label: 'Gestionar propiedades' },
  { id: 'trade', label: 'Intercambiar' },
]

/** Teclas por defecto (valores de `KeyboardEvent.code`, que no dependen de la distribución del teclado). */
export const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  fast: 'Space',
  roll: 'Space',
  accept: 'Enter',
  reject: 'Escape',
  manage: 'KeyG',
  trade: 'KeyI',
}

export const UI_SCALE_MIN = 75
export const UI_SCALE_MAX = 125
export const UI_SCALE_STEP = 5

export interface Settings {
  v: 1
  audio: {
    musicVolume: number
    sfxVolume: number
    /** Archivo de la canción elegida (null = la primera de la lista) */
    trackFile: string | null
  }
  video: {
    /** Tablero inclinado (vista 3D) */
    view3d: boolean
  }
  gameplay: {
    /** Tamaño de la interfaz en % (75–125) */
    uiScale: number
    hotkeysEnabled: boolean
    hotkeys: Record<HotkeyAction, string>
  }
}

export const DEFAULT_SETTINGS: Settings = {
  v: 1,
  audio: { musicVolume: 0.5, sfxVolume: 0.7, trackFile: null },
  video: { view3d: false },
  gameplay: { uiScale: 100, hotkeysEnabled: true, hotkeys: { ...DEFAULT_HOTKEYS } },
}

export const cloneSettings = (s: Settings): Settings => ({
  v: 1,
  audio: { ...s.audio },
  video: { ...s.video },
  gameplay: { ...s.gameplay, hotkeys: { ...s.gameplay.hotkeys } },
})

const num = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

const KEY_RE = /^[A-Za-z0-9]{1,20}$/

/** Acepta cualquier cosa y devuelve una configuración completa y válida (lo que falte o sea inválido, por defecto). */
export function sanitizeSettings(input: unknown): Settings {
  const d = DEFAULT_SETTINGS
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, any>
  const audio = (o.audio && typeof o.audio === 'object' ? o.audio : {}) as Record<string, unknown>
  const video = (o.video && typeof o.video === 'object' ? o.video : {}) as Record<string, unknown>
  const gp = (o.gameplay && typeof o.gameplay === 'object' ? o.gameplay : {}) as Record<string, any>
  const keys = (gp.hotkeys && typeof gp.hotkeys === 'object' ? gp.hotkeys : {}) as Record<string, unknown>
  const hotkeys = { ...DEFAULT_HOTKEYS }
  for (const a of HOTKEY_ACTIONS) {
    const k = keys[a.id]
    if (typeof k === 'string' && KEY_RE.test(k)) hotkeys[a.id] = k
  }
  const scale = Math.round(num(gp.uiScale, UI_SCALE_MIN, UI_SCALE_MAX, d.gameplay.uiScale) / UI_SCALE_STEP) * UI_SCALE_STEP
  return {
    v: 1,
    audio: {
      musicVolume: num(audio.musicVolume, 0, 1, d.audio.musicVolume),
      sfxVolume: num(audio.sfxVolume, 0, 1, d.audio.sfxVolume),
      trackFile: typeof audio.trackFile === 'string' && audio.trackFile.length <= 200 ? audio.trackFile : null,
    },
    video: { view3d: typeof video.view3d === 'boolean' ? video.view3d : d.video.view3d },
    gameplay: {
      uiScale: scale,
      hotkeysEnabled: typeof gp.hotkeysEnabled === 'boolean' ? gp.hotkeysEnabled : d.gameplay.hotkeysEnabled,
      hotkeys,
    },
  }
}

/** Nombre legible de una tecla (`KeyboardEvent.code`). */
export function keyLabel(code: string): string {
  if (code === 'Space') return 'Barra espaciadora'
  if (code === 'Escape') return 'Esc'
  if (code === 'Enter' || code === 'NumpadEnter') return 'Enter'
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^Numpad\d$/.test(code)) return 'Num ' + code.slice(6)
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] ?? code
  return code
}
