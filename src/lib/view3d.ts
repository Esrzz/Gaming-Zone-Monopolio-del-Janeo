import { useSyncExternalStore } from 'react'

const KEY = 'gz-view3d'
const EVT = 'gz-view3d-change'
/** Pantallas angostas o táctiles: el 3D se desactiva solo (el tablero ya es chico). */
const NARROW_QUERY = '(max-width: 900px), (hover: none) and (pointer: coarse)'

function readPref(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setView3d(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT))
}

function subPref(cb: () => void) {
  window.addEventListener(EVT, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener('storage', cb) }
}

function subNarrow(cb: () => void) {
  const mq = window.matchMedia(NARROW_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** `pref`: lo que eligió el jugador (por defecto 2D). `active`: si realmente se aplica (pref y pantalla apta). */
export function useView3d() {
  const pref = useSyncExternalStore(subPref, readPref, () => false)
  const narrow = useSyncExternalStore(subNarrow, () => window.matchMedia(NARROW_QUERY).matches, () => false)
  return { pref, narrow, active: pref && !narrow }
}
