import { useSyncExternalStore } from 'react'
import { DEFAULT_SETTINGS, cloneSettings, sanitizeSettings } from '../engine'
import type { Settings } from '../engine'
import { SERVER_URL, getToken } from './net'

const KEY = 'gz-settings'
const SAVE_DELAY_MS = 800

function readLocal(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return sanitizeSettings(JSON.parse(raw))
    // migración: antes cada opción tenía su propia clave
    const legacy = cloneSettings(DEFAULT_SETTINGS)
    const a = localStorage.getItem('gz-audio-prefs')
    if (a) Object.assign(legacy.audio, sanitizeSettings({ audio: JSON.parse(a) }).audio)
    if (localStorage.getItem('gz-view3d') === '1') legacy.video.view3d = true
    return legacy
  } catch {
    return cloneSettings(DEFAULT_SETTINGS)
  }
}

let current: Settings = readLocal()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null
/** null = todavía no se pudo leer el perfil del servidor (no se guarda nada hasta entonces para no pisarlo) */
let loaded: Promise<boolean> | null = null
let serverOk = false

const emit = () => listeners.forEach((l) => l())

function saveLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* sin almacenamiento */ }
}

export const getSettings = (): Settings => current
export const subscribeSettings = (cb: () => void) => {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
export const useSettings = (): Settings => useSyncExternalStore(subscribeSettings, getSettings, () => DEFAULT_SETTINGS)

const authHeaders = () => ({ authorization: `Bearer ${getToken()}`, 'content-type': 'application/json' })

async function pushToServer() {
  try {
    await fetch(`${SERVER_URL}/api/settings`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ settings: current }) })
  } catch { /* sin conexión: queda guardado en este navegador y se reintenta con el próximo cambio */ }
}

function scheduleSave() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    timer = null
    if (!serverOk) await loadProfileSettings(true)
    if (serverOk) void pushToServer()
  }, SAVE_DELAY_MS)
}

/** Cambia la configuración (se valida), la guarda en este navegador y, un instante después, en el perfil del servidor. */
export function updateSettings(change: (draft: Settings) => void) {
  const draft = cloneSettings(current)
  change(draft)
  current = sanitizeSettings(draft)
  saveLocal()
  emit()
  scheduleSave()
}

export function resetSettings() {
  updateSettings((d) => Object.assign(d, cloneSettings(DEFAULT_SETTINGS)))
}

/**
 * Al abrir la página: pide al servidor la configuración de este perfil. Si existe, reemplaza la local;
 * si el perfil es nuevo, queda la de este navegador (por defecto si no había) y se guarda en el servidor.
 */
export function loadProfileSettings(retry = false): Promise<boolean> {
  if (loaded && !retry) return loaded
  loaded = (async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/settings`, { headers: authHeaders() })
      if (!res.ok) return false
      const data = (await res.json()) as { settings: unknown | null }
      serverOk = true
      if (data.settings) {
        current = sanitizeSettings(data.settings)
        saveLocal()
        emit()
      } else {
        void pushToServer()
      }
      return true
    } catch {
      return false
    }
  })()
  return loaded
}
