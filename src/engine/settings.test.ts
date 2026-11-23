import { describe, expect, it } from 'vitest'
import { DEFAULT_HOTKEYS, DEFAULT_SETTINGS, keyLabel, sanitizeSettings } from './index'

describe('configuración del perfil', () => {
  it('por defecto: 100%, atajos activados y las teclas pedidas', () => {
    const s = sanitizeSettings(undefined)
    expect(s).toEqual(DEFAULT_SETTINGS)
    expect(s.gameplay.uiScale).toBe(100)
    expect(s.gameplay.hotkeysEnabled).toBe(true)
    expect(DEFAULT_HOTKEYS).toEqual({ fast: 'Space', roll: 'Space', accept: 'Enter', reject: 'Escape', manage: 'KeyG', trade: 'KeyI' })
  })

  it('valida y acota: escala 75–125 de a 5, volúmenes 0–1, teclas con formato válido', () => {
    const s = sanitizeSettings({
      gameplay: { uiScale: 10, hotkeysEnabled: 'sí', hotkeys: { manage: 'KeyM', trade: 'tecla rara!', roll: 5 } },
      audio: { musicVolume: 9, sfxVolume: -1, trackFile: 'a.mp3' },
      video: { view3d: 'x' },
    })
    expect(s.gameplay.uiScale).toBe(75)
    expect(sanitizeSettings({ gameplay: { uiScale: 999 } }).gameplay.uiScale).toBe(125)
    expect(sanitizeSettings({ gameplay: { uiScale: 83 } }).gameplay.uiScale).toBe(85)
    expect(s.gameplay.hotkeysEnabled).toBe(true)
    expect(s.gameplay.hotkeys.manage).toBe('KeyM')
    expect(s.gameplay.hotkeys.trade).toBe('KeyI')
    expect(s.gameplay.hotkeys.roll).toBe('Space')
    expect(s.audio).toEqual({ musicVolume: 1, sfxVolume: 0, trackFile: 'a.mp3' })
    expect(s.video.view3d).toBe(false)
  })

  it('con basura devuelve la configuración por defecto', () => {
    expect(sanitizeSettings('basura')).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('nombres legibles de teclas', () => {
    expect(keyLabel('Space')).toBe('Barra espaciadora')
    expect(keyLabel('KeyG')).toBe('G')
    expect(keyLabel('Escape')).toBe('Esc')
    expect(keyLabel('Digit3')).toBe('3')
  })
})
