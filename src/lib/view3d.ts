import { useSyncExternalStore } from 'react'
import { updateSettings, useSettings } from './settingsStore'

/** Pantallas angostas o táctiles: el 3D se desactiva solo (el tablero ya es chico). */
const NARROW_QUERY = '(max-width: 900px), (hover: none) and (pointer: coarse)'

export const setView3d = (on: boolean) => updateSettings((s) => { s.video.view3d = on })

function subNarrow(cb: () => void) {
  const mq = window.matchMedia(NARROW_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** `pref`: lo que eligió el jugador (por defecto 2D). `active`: si realmente se aplica (pref y pantalla apta). */
export function useView3d() {
  const pref = useSettings().video.view3d
  const narrow = useSyncExternalStore(subNarrow, () => window.matchMedia(NARROW_QUERY).matches, () => false)
  return { pref, narrow, active: pref && !narrow }
}
