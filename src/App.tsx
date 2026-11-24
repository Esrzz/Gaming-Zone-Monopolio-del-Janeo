import { useEffect, useState } from 'react'
import avatars from './data/avatars.json'
import AuroraBackground from './components/AuroraBackground'
import Avatar from './components/Avatar'
import DevGame from './components/DevGame'
import OnlineRoom from './components/OnlineRoom'
import Header from './components/Header'
import SettingsModal from './components/SettingsModal'
import type { Seat } from './components/Board'
import { isDevId } from './lib/dev'
import { lastRoom, requestRoomCode } from './lib/net'
import { findAvatar, NAME_MAX, validName } from './lib/profile'
import { play as playSfx } from './lib/sfx'
import { loadProfileSettings } from './lib/settingsStore'
import { useAudio } from './lib/useAudio'

type Screen = 'name' | 'menu' | 'play' | 'join' | 'devgame' | 'online'

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
  const [room, setRoom] = useState<{ code: string; create: boolean } | null>(null)
  const [onlineWide, setOnlineWide] = useState(false)
  const [hostError, setHostError] = useState<string | null>(null)
  const [hostBusy, setHostBusy] = useState(false)

  const { prefs, tracks, setMusicVolume, setSfxVolume, setTrack, startMusic } = useAudio()

  // Perfil: trae la configuración guardada en el servidor (si el perfil es nuevo queda la por defecto)
  useEffect(() => { void loadProfileSettings() }, [])

  // Sonido de clic en cualquier botón habilitado (los botones con sonido propio lo evitan con data-nosound)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('button, a, [role="button"], input[type="checkbox"]')
      if (!el || (el as HTMLButtonElement).disabled || el.hasAttribute('data-nosound')) return
      playSfx('click')
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

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

  const hostRoom = async () => {
    setHostError(null)
    setHostBusy(true)
    try {
      const c = await requestRoomCode()
      setRoom({ code: c, create: true })
      setScreen('online')
    } catch (e) {
      setHostError(e instanceof Error ? e.message : 'No se pudo crear la sala')
    } finally {
      setHostBusy(false)
    }
  }

  const joinRoom = (c: string, create = false) => {
    setRoom({ code: c, create })
    setScreen('online')
  }

  const leaveOnline = () => {
    setRoom(null)
    setOnlineWide(false)
    setScreen('menu')
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
          tracks={tracks}
          trackFile={prefs.trackFile}
          onMusicVolume={setMusicVolume}
          onSfxVolume={setSfxVolume}
          onTrack={setTrack}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <main className={`stage ${screen === 'devgame' || (screen === 'online' && onlineWide) ? 'wide' : ''}`}>
        {screen !== 'devgame' && !(screen === 'online' && onlineWide) && (
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

        {profile && screen !== 'name' && screen !== 'devgame' && screen !== 'online' && (
          <div className="card">
            {screen === 'menu' && (
              <div className="stack">
                <button className="btn primary" onClick={() => setScreen('play')}>
                  Jugar
                </button>
                {lastRoom.get() && (
                  <button className="btn ghost" onClick={() => joinRoom(lastRoom.get()!)}>
                    Volver a la sala {lastRoom.get()}
                  </button>
                )}
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
                {hostError && <p className="err">{hostError}</p>}
                <button className="btn primary" disabled={hostBusy} onClick={() => void hostRoom()}>
                  {hostBusy ? 'Creando sala…' : 'Hostear partida'}
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
                <button className="btn primary" disabled={code.length < 4} onClick={() => joinRoom(code)}>
                  Unirse
                </button>
                <button className="link" onClick={() => setScreen('play')}>
                  Volver
                </button>
              </div>
            )}
          </div>
        )}

        {screen === 'online' && profile && room && (
          <OnlineRoom
            code={room.code}
            create={room.create}
            name={profile.name}
            avatar={profile.avatar}
            onExit={leaveOnline}
            onSettings={() => setSettingsOpen(true)}
            onLayout={setOnlineWide}
          />
        )}

        {screen === 'devgame' && (
          <DevGame
            seats={seats}
            onExit={() => setScreen('menu')}
            onSettings={() => setSettingsOpen(true)}
          />
        )}
      </main>
    </>
  )
}
