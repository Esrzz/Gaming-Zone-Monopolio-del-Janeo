import avatars from '../data/avatars.json'

export interface DiscordAvatar {
  id: string
  name: string
  avatar: string
}

/** Minúsculas, sin acentos, sin espacios ni símbolos: "Kawaga." -> "kawaga" */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Devuelve el miembro de Discord cuyo nombre coincide con el elegido, o null. */
export function findAvatar(
  name: string,
  list: DiscordAvatar[] = avatars as DiscordAvatar[],
): DiscordAvatar | null {
  const key = normalizeName(name)
  if (!key) return null
  return list.find((m) => normalizeName(m.name) === key) ?? null
}

export const NAME_MAX = 20

/** Nombre válido: 2 a 20 caracteres con algo visible. */
export function validName(name: string): boolean {
  const t = name.trim()
  return t.length >= 2 && t.length <= NAME_MAX
}
