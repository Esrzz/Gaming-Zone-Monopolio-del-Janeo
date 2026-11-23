import { useEffect, useRef } from 'react'
import { HOTKEY_ACTIONS } from '../engine'
import type { HotkeyAction } from '../engine'
import { getSettings } from './settingsStore'

/** Cada atajo devuelve `true` si hizo algo (así Espacio puede ser "acelerar" y "tirar" a la vez sin que se pisen). */
export type HotkeyHandlers = Partial<Record<HotkeyAction, () => boolean | void>>

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

/**
 * Atajos de teclado de la partida. Se ignoran si están desactivados, si estás escribiendo (chat),
 * con Ctrl/Alt/Cmd, o si hay una ventana abierta (configuración, gestionar, intercambio…).
 */
export function useHotkeys(handlers: HotkeyHandlers) {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const matches = (e: KeyboardEvent) => {
      const { gameplay } = getSettings()
      if (!gameplay.hotkeysEnabled || e.ctrlKey || e.altKey || e.metaKey || typing(e.target)) return null
      if (document.querySelector('.modal-backdrop')) return null
      return HOTKEY_ACTIONS.filter((a) => gameplay.hotkeys[a.id] === e.code || (a.id === 'accept' && gameplay.hotkeys.accept === 'Enter' && e.code === 'NumpadEnter'))
    }
    const onDown = (e: KeyboardEvent) => {
      const acts = matches(e)
      if (!acts || acts.length === 0 || e.repeat) return
      for (const a of acts) {
        if (ref.current[a.id]?.()) {
          e.preventDefault()
          // si había un botón con el foco, que Espacio/Enter no lo vuelva a pulsar
          ;(document.activeElement as HTMLElement | null)?.blur?.()
          return
        }
      }
    }
    // Espacio activa el botón con el foco al SOLTARLO: si el atajo lo usó, se cancela también ahí
    const onUp = (e: KeyboardEvent) => {
      const acts = matches(e)
      if (acts && acts.length > 0 && (e.code === 'Space' || e.code === 'Enter')) e.preventDefault()
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])
}
