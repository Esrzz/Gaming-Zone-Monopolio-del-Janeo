import { useState } from 'react'
import { TRACKS } from '../lib/useAudio'

type Tab = 'video' | 'audio' | 'jugabilidad' | 'otros'

interface Props {
  musicVolume: number
  sfxVolume: number
  trackIndex: number
  onMusicVolume: (v: number) => void
  onSfxVolume: (v: number) => void
  onTrack: (i: number) => void
  onClose: () => void
}

export default function SettingsModal({
  musicVolume,
  sfxVolume,
  trackIndex,
  onMusicVolume,
  onSfxVolume,
  onTrack,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('audio')

  const TABS: { id: Tab; label: string }[] = [
    { id: 'video',       label: '🖥 Video' },
    { id: 'audio',       label: '🔊 Audio' },
    { id: 'jugabilidad', label: '🎮 Jugabilidad' },
    { id: 'otros',       label: '⚙ Otros' },
  ]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Configuraciones">
        <div className="modal-header">
          <h2>Configuraciones</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="modal-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`modal-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'audio' && (
            <div className="settings-section">
              <div className="setting-row">
                <label className="setting-label">
                  Volumen de música
                  <span className="setting-value">{Math.round(musicVolume * 100)}%</span>
                </label>
                <input
                  type="range"
                  className="slider"
                  min={0}
                  max={1}
                  step={0.01}
                  value={musicVolume}
                  onChange={(e) => onMusicVolume(Number(e.target.value))}
                />
              </div>

              <div className="setting-row">
                <label className="setting-label">
                  Volumen de efectos
                  <span className="setting-value">{Math.round(sfxVolume * 100)}%</span>
                </label>
                <input
                  type="range"
                  className="slider"
                  min={0}
                  max={1}
                  step={0.01}
                  value={sfxVolume}
                  onChange={(e) => onSfxVolume(Number(e.target.value))}
                />
              </div>

              <div className="setting-row">
                <label className="setting-label">Canción de fondo</label>
                <div className="track-list">
                  {TRACKS.map((t, i) => (
                    <button
                      key={t.file}
                      className={`track-btn${trackIndex === i ? ' active' : ''}`}
                      onClick={() => onTrack(i)}
                    >
                      <span className="track-icon">{trackIndex === i ? '▶' : '♪'}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'video' && (
            <div className="settings-section">
              <p className="muted">Opciones de video: próximamente.</p>
            </div>
          )}

          {tab === 'jugabilidad' && (
            <div className="settings-section">
              <p className="muted">Opciones de jugabilidad: próximamente.</p>
            </div>
          )}

          {tab === 'otros' && (
            <div className="settings-section">
              <p className="muted">Otras opciones: próximamente.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
