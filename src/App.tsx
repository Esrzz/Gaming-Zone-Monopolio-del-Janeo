import { useState } from 'react'
import avatars from './data/avatars.json'
import AuroraBackground from './components/AuroraBackground'
import Avatar from './components/Avatar'
import DevGame from './components/DevGame'
import Header from './components/Header'
import SettingsModal from './components/SettingsModal'
import type { Seat } from './components/Board'
import { isDevId } from './lib/dev'
import { findAvatar, NAME_MAX, validName } from './lib/profile'
import { useAudio } from './lib/useAudio'

type Screen = 'name' | 'menu' | 'play' | 'join' | 'host' | 'devgame'

interface Profile {
  id: string | null
  name: string
  avatar: string | null
}

function buildSeats(profile: Profile, count: number): Seat[] {
  const self: Seat = { id: profile.id ?? 'dev', name: profile.name, avatar: profile.avatar }
  const others = avatars.filter((m) => m.id !== self.id).slice(0, count - 1)
  return [self, ...others]
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('name')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [draft, setDraft] = useState('')
  const [code, setCode] = useState('')
  const [devMode, setDevMode] = useState(false)
  const [devPlayers, setDevPlayers] = useState(3)
  const [seats, setSeats] = useState<Seat[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { prefs, setMusicVolume, setSfxVolume, setTrack, startMusic } = useAudio()

  const match = findAvatar(draft)
  const canDev = isDevId(profile?.id)

  const confirmName = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validName(draft)) return
    const m = findAvatar(draft)
    setProfile({ id: m?.id ?? null, name: m?.name ?? draft.trim(), avatar: m?.avatar ?? null })
    setDevMode(false)
    // Arranca la música en la primera interacción del usuario
    startMusic()
    setScreen('menu')
  }

  const toggleDev = (on: boolean) => {
    setDevMode(on)
    if (!on && screen === 'devgame') setScreen('menu')
  }

  const startDevGame = () => {
    if (!profile) return
    setSeats(buildSeats(profile, devPlayers))
    setScreen('devgame')
  }

  return (
    <>
      <AuroraBackground />
      {profile && screen !== 'name' && (
        <Header
          name={profile.name}
          avatar={profile.avatar}
          canDev={canDev}
          devMode={devMode}
          onToggleDev={toggleDev}
          onSettings={() => setSettingsOpen(true)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          musicVolume={prefs.musicVolume}
          sfxVolume={prefs.sfxVolume}
          trackIndex={prefs.trackIndex}
          onMusicVolume={setMusicVolume}
          onSfxVolume={setSfxVolume}
          onTrack={setTrack}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <main className={`stage ${screen === 'devgame' ? 'wide' : ''}`}>
        {screen !== 'devgame' && (
          <header className="brandline">
            <span className="brand-top">Gaming Zone</span>
            <h1>Monopolio del janeo</h1>
          </header>
        )}

        {screen === 'name' && (
          <form className="card" onSubmit={confirmName}>
            <h2>¿Cómo te llamás?</h2>
            <p className="muted">Elegí tu nombre de perfil. Si sos del server, vas a aparecer con tu avatar.</p>
            <div className="name-row">
              <Avatar name={draft || '?'} src={match?.avatar} size={56} />
              <input
                className="input"
                value={draft}
                maxLength={NAME_MAX}
                autoFocus
                placeholder="Tu nombre de perfil"
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Nombre de perfil"
              />
            </div>
            <p className="hint" aria-live="polite">
              {match ? `Te encontré: ${match.name}` : ' '}
            </p>
            <button className="btn primary" type="submit" disabled={!validName(draft)}>
              Continuar
            </button>
          </form>
        )}

        {profile && screen !== 'name' && screen !== 'devgame' && (
          <div className="card">
            {screen === 'menu' && (
              <div className="stack">
                <button className="btn primary" onClick={() => setScreen('play')}>
                  Jugar
                </button>
                <button className="btn ghost" onClick={() => setSettingsOpen(true)}>
                  Configuraciones
                </button>
                <button className="link" onClick={() => setScreen('name')}>
                  Cambiar de perfil
                </button>

                {canDev && devMode && (
                  <div className="devbox">
                    <h3>Modo developer</h3>
                    <p className="muted">Partida local donde vos tirás los dados de todos los turnos.</p>
                    <label className="check">
                      Jugadores
                      <select className="input sm" value={devPlayers} onChange={(e) => setDevPlayers(Number(e.target.value))}>
                        {[2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="btn primary" onClick={startDevGame}>
                      Iniciar partida de prueba
                    </button>
                  </div>
                )}
              </div>
            )}

            {screen === 'play' && (
              <div className="stack">
                <button className="btn primary" onClick={() => setScreen('host')}>
                  Hostear partida
                </button>
                <button className="btn ghost" onClick={() => setScreen('join')}>
                  Unirse con código
                </button>
                <button className="link" onClick={() => setScreen('menu')}>
                  Volver
                </button>
              </div>
            )}

            {screen === 'join' && (
              <div className="stack">
                <input
                  className="input code"
                  value={code}
                  maxLength={6}
                  autoFocus
                  placeholder="CÓDIGO"
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  aria-label="Código de sala"
                />
                <button className="btn primary" disabled={code.length < 4}>
                  Unirse
                </button>
                <p className="muted">Las salas online todavía no están conectadas.</p>
                <button className="link" onClick={() => setScreen('play')}>
                  Volver
                </button>
              </div>
            )}

            {screen === 'host' && (
              <div className="stack">
                <p className="muted">Acá se va a generar el código de la sala. Falta el servidor.</p>
                <button className="link" onClick={() => setScreen('play')}>
                  Volver
                </button>
              </div>
            )}
          </div>
        )}

        {screen === 'devgame' && (
          <DevGame
            seats={seats}
            onExit={() => setScreen('menu')}
          />
        )}
      </main>
    </>
  )
}
