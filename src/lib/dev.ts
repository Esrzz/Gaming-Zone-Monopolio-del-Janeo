/** Perfiles de Discord con modo developer: Criatura y Misunder. */
export const DEV_IDS = ['486213975483088898', '955813065255972864']

/**
 * Por ahora el perfil se reconoce por el nombre elegido, así que esto es solo comodidad de desarrollo:
 * no da ningún permiso real. Cuando exista el login con Discord, se valida con la cuenta.
 */
export const isDevId = (id: string | null | undefined): boolean => !!id && DEV_IDS.includes(id)
