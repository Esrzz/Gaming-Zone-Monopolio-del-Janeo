import { useEffect, useState } from 'react'
import { DEFAULT_HOTKEYS, HOTKEY_ACTIONS, keyLabel } from '../engine'
import type { HotkeyAction } from '../engine'
import { updateSettings, useSettings } from '../lib/settingsStore'

const RESERVED = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock', 'Tab', 'NumLock'])

/** Personalizar atajos: clic en una tecla y se pulsa la nueva. Acelerar y Tirar dados pueden compartir tecla (nunca coinciden en el tiempo). */
export default function HotkeysModal({ onClose }: { onClose: () => void }) {
  const keys = useSettings().gameplay.hotkeys
  const [capturing, setCapturing] = useState<HotkeyAction | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (RESERVED.has(e.code)) {
        setNote('Esa tecla no se puede usar. Probá con otra.')
        return
      }
      updateSettings((s) => { s.gameplay.hotkeys[capturing] = e.code })
      setCapturing(null)
      setNote(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing])

  const clash = (id: HotkeyAction) =>
    HOTKEY_ACTIONS.find((o) => o.id !== id && keys[o.id] === keys[id] && !((id === 'fast' && o.id === 'roll') || (id === 'roll' && o.id === 'fast')))

  return (
    <div className="modal-backdrop hk-backdrop" onClick={onClose}>
      <div className="modal hk-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Atajos de teclado">
        <div className="modal-header">
          <h2>Atajos de teclado</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <ul className="hk-list">
            {HOTKEY_ACTIONS.map((a) => {
              const c = clash(a.id)
              return (
                <li key={a.id}>
                  <span className="hk-name">
                    {a.label}
                    {c && <span className="hk-clash">Repetida con «{c.label}»</span>}
                  </span>
                  <button
                    type="button"
                    className={`keycap${capturing === a.id ? ' capturing' : ''}`}
                    onClick={() => { setNote(null); setCapturing(capturing === a.id ? null : a.id) }}
                  >
                    {capturing === a.id ? 'Presioná una tecla…' : keyLabel(keys[a.id])}
                  </button>
                </li>
              )
            })}
          </ul>
          {capturing && <p className="setting-hint">Presioná la tecla nueva (Esc también vale). Para cancelar, hacé clic de nuevo en el botón.</p>}
          {note && <p className="err">{note}</p>}
          <div className="hk-actions">
            <button
              className="btn ghost"
              disabled={HOTKEY_ACTIONS.every((a) => keys[a.id] === DEFAULT_HOTKEYS[a.id])}
              onClick={() => { setCapturing(null); updateSettings((s) => { s.gameplay.hotkeys = { ...DEFAULT_HOTKEYS } }) }}
            >
              Restablecer atajos
            </button>
            <button className="btn primary" onClick={onClose}>Listo</button>
          </div>
        </div>
      </div>
    </div>
  )
}
