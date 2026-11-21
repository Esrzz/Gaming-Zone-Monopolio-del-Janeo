import { useCallback, useEffect, useRef, useState } from 'react'
import { loadManifest } from './audioManifest'
import type { Track } from './audioManifest'
import { setSfxVolume as applySfxVolume } from './sfx'

export type { Track }

const STORAGE_KEY = 'gz-audio-prefs'

interface AudioPrefs {
  musicVolume: number
  sfxVolume: number
  /** Archivo de la canción elegida (null = la primera de la lista) */
  trackFile: string | null
}

const DEFAULTS: AudioPrefs = { musicVolume: 0.5, sfxVolume: 0.7, trackFile: null }

function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULTS
}

function savePrefs(p: AudioPrefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

export function useAudio() {
  const [prefs, setPrefs] = useState<AudioPrefs>(loadPrefs)
  const [tracks, setTracks] = useState<Track[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startedRef = useRef(false)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  const current = tracks.find((t) => t.file === prefs.trackFile) ?? tracks[0] ?? null

  // Elemento de audio de la música (uno solo) y lista de canciones desde el manifest
  useEffect(() => {
    const el = new Audio()
    el.loop = true
    el.volume = prefsRef.current.musicVolume
    audioRef.current = el
    let alive = true
    void loadManifest().then((m) => {
      if (!alive) return
      setTracks(m.music)
      const t = m.music.find((x) => x.file === prefsRef.current.trackFile) ?? m.music[0]
      if (t) {
        el.src = t.file
        if (startedRef.current) void el.play().catch(() => { /* bloqueado */ })
      }
    })
    return () => { alive = false; el.pause(); audioRef.current = null }
  }, [])

  // Volúmenes + persistencia
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = prefs.musicVolume
    applySfxVolume(prefs.sfxVolume)
    savePrefs(prefs)
  }, [prefs])

  const setTrack = useCallback((file: string) => {
    setPrefs((p) => ({ ...p, trackFile: file }))
    const el = audioRef.current
    if (!el) return
    const wasPlaying = !el.paused
    el.pause()
    el.src = file
    el.load()
    if (wasPlaying || startedRef.current) void el.play().catch(() => { /* bloqueado */ })
  }, [])

  // Iniciar música (llamar desde una interacción del usuario la primera vez)
  const startMusic = useCallback(() => {
    const el = audioRef.current
    if (!el || startedRef.current) return
    startedRef.current = true
    if (el.src) void el.play().catch(() => { /* autoplay bloqueado */ })
  }, [])

  const setMusicVolume = useCallback((v: number) => setPrefs((p) => ({ ...p, musicVolume: v })), [])
  const setSfxVolume = useCallback((v: number) => setPrefs((p) => ({ ...p, sfxVolume: v })), [])

  return { prefs, tracks, current, setMusicVolume, setSfxVolume, setTrack, startMusic }
}
