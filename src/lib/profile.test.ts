import { describe, expect, it } from 'vitest'
import { findAvatar, normalizeName, validName } from './profile'

describe('perfil', () => {
  it('normaliza mayúsculas, acentos y símbolos', () => {
    expect(normalizeName('  Kawaga. ')).toBe('kawaga')
    expect(normalizeName('Ñandú')).toBe('nandu')
  })

  it('encuentra el avatar sin importar mayúsculas', () => {
    expect(findAvatar('cuervo')?.id).toBe('486318426156171274')
    expect(findAvatar('  NICKI ')?.name).toBe('Nicki')
  })

  it('encuentra nombres con símbolos aunque se escriban sin ellos', () => {
    expect(findAvatar('kawaga')?.name).toBe('kawaga.')
  })

  it('devuelve null si no hay coincidencia', () => {
    expect(findAvatar('nadie123')).toBeNull()
    expect(findAvatar('   ')).toBeNull()
  })

  it('valida el largo del nombre', () => {
    expect(validName('a')).toBe(false)
    expect(validName('ab')).toBe(true)
    expect(validName('x'.repeat(21))).toBe(false)
  })
})
