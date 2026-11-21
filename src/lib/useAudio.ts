import { useCallback, useEffect, useRef, useState } from 'react'

export interface Track {
  file: string
  label: string
}

export const TRACKS: Track[] = [
  { file: '/audio/SoundtrackElectroChill.mp3', label: 'Soundtrack Electro Chill' },
  { file: '/audio/TodosJaneadov1.2.mp3',       label: 'Todos Janeado v1.2' },
  { file: '/audio/rock,alt.mp3',               label: 'Rock Alt' },
]

const STORAGE_KEY = 'gz-audio-prefs'

interface AudioPrefs {
  musicVolume: number
  sfxVolume: number
  trackIndex: number
}

function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...{ musicVolume: 0.5, sfxVolume: 0.7, trackIndex: 0 }, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { musicVolume: 0.5, sfxVolume: 0.7, trackIndex: 0 }
}

function savePrefs(p: AudioPrefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

export function useAudio() {
  const [prefs, setPrefs] = useState<AudioPrefs>(loadPrefs)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startedRef = useRef(false)

  // Crear el elemento de audio una sola vez
  useEffect(() => {
    const el = new Audio(TRACKS[prefs.trackIndex].file)
    el.loop = true
    el.volume = prefs.musicVolume
    audioRef.current = el
    return () => { el.pause(); audioRef.current = null }
    // Solo en mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sincronizar volumen de música
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = prefs.musicVolume
    savePrefs(prefs)
  }, [prefs])

  // Cambiar canción
  const setTrack = useCallback((index: number) => {
    setPrefs((p) => ({ ...p, trackIndex: index }))
    const el = audioRef.current
    if (!el) return
    const wasPlaying = !el.paused
    el.pause()
    el.src = TRACKS[index].file
    el.load()
    if (wasPlaying) void el.play()
  }, [])

  // Iniciar música (llamar desde interacción del usuario la primera vez)
  const startMusic = useCallback(() => {
    const el = audioRef.current
    if (!el || startedRef.current) return
    startedRef.current = true
    void el.play().catch(() => { /* autoplay bloqueado */ })
  }, [])

  const setMusicVolume = useCallback((v: number) => {
    setPrefs((p) => ({ ...p, musicVolume: v }))
  }, [])

  const setSfxVolume = useCallback((v: number) => {
    setPrefs((p) => ({ ...p, sfxVolume: v }))
  }, [])

  return { prefs, setMusicVolume, setSfxVolume, setTrack, startMusic }
}
