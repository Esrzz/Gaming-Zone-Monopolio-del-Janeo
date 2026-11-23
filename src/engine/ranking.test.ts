import { describe, expect, it } from 'vitest'
import { BOARD, DEFAULT_GAMES, STREET_COUNT, boardOf, createGame, createRoom, joinRoom, rankingFromStats, sanitizeGames, setReady, startGame, toPublicState } from './index'

const icon = (n: number) => `https://cdn.discordapp.com/app-icons/${n}/x.png?size=64`
const stats = {
  members: {
    a: { games: { Alfa: 3600 * 10, Beta: 3600 }, ranchoGames: { Alfa: 3600 * 5 } },
    b: { games: { Beta: 3600 * 20, Gamma: 7200 } },
  },
  gameApps: { Alfa: 1, Beta: 2, Gamma: 3, SinHoras: 4 },
  gameIcons: { Alfa: icon(1), Beta: 'http://evil.example/x.png', Gamma: icon(3) },
}

describe('ranking en vivo', () => {
  it('suma horas de games y ranchoGames, ordena y valida los íconos', () => {
    const r = rankingFromStats(stats)
    expect(r.map((g) => [g.name, g.hours])).toEqual([['Beta', 21], ['Alfa', 15], ['Gamma', 2], ['SinHoras', 0]])
    expect(r.find((g) => g.name === 'Beta')!.icon).toBeNull() // host no permitido
    expect(r.find((g) => g.name === 'Alfa')!.icon).toBe(icon(1))
  })

  it('con datos inválidos devuelve vacío', () => {
    expect(rankingFromStats(null)).toEqual([])
    expect(rankingFromStats({ members: {} })).toEqual([])
  })

  it('sanitizeGames deja exactamente 22, sin repetidos, completando con el respaldo', () => {
    const g = sanitizeGames([{ name: 'Alfa', hours: 9, icon: null }, { name: 'Alfa', hours: 1, icon: null }, { name: '', hours: 1 }, 5, null])
    expect(g).toHaveLength(STREET_COUNT)
    expect(g[0].name).toBe('Alfa')
    expect(new Set(g.map((x) => x.name)).size).toBe(STREET_COUNT)
    expect(sanitizeGames('basura')).toEqual(DEFAULT_GAMES)
  })

  it('el #1 va a la calle más cara y el último a la más barata', () => {
    const games = sanitizeGames(rankingFromStats(stats))
    const board = boardOf({ games })
    expect(board[39].name).toBe('Beta')
    expect(board[1].name).toBe(games[STREET_COUNT - 1].name)
  })

  it('las reglas no dependen de qué juegos haya', () => {
    const games = sanitizeGames([{ name: 'Alfa', hours: 9, icon: null }])
    const b = boardOf({ games })
    b.forEach((t, i) => {
      const d = BOARD[i]
      expect(t.kind).toBe(d.kind)
      if (t.kind === 'property' && d.kind === 'property') expect([t.group, t.price, t.rent]).toEqual([d.group, d.price, d.rent])
    })
  })

  it('la sala le pasa su ranking a la partida y viaja en el estado público', () => {
    const games = sanitizeGames(rankingFromStats(stats))
    let room = createRoom('ABCDE', { id: 'h', name: 'Host' }, games)
    for (const id of ['p2']) { const r = joinRoom(room, { id, name: id }); if (r.ok) room = r.room }
    for (const id of ['p2']) { const r = setReady(room, id, true); if (r.ok) room = r.room }
    const started = startGame(room, 'h', 1)
    expect(started.ok).toBe(true)
    if (started.ok) {
      expect(started.room.game!.games[0].name).toBe('Beta')
      expect(toPublicState(started.room.game!).games[0].name).toBe('Beta')
    }
  })

  it('sin ranking usa el del build', () => {
    expect(createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]).games).toEqual(DEFAULT_GAMES)
  })
})

describe('color de la ficha en el lobby', () => {
  it('cada jugador recibe un color distinto y puede cambiarlo si está libre', async () => {
    const { setColor, PLAYER_COLORS } = await import('./index')
    let room = createRoom('ABCDE', { id: 'h', name: 'Host' })
    const j = joinRoom(room, { id: 'p2', name: 'Pepe' })
    if (j.ok) room = j.room
    expect(room.members[0].color).toBe(PLAYER_COLORS[0])
    expect(room.members[1].color).toBe(PLAYER_COLORS[1])
    const taken = setColor(room, 'p2', PLAYER_COLORS[0])
    expect(taken.ok).toBe(false)
    const free = setColor(room, 'p2', PLAYER_COLORS[4])
    expect(free.ok && free.room.members[1].color).toBe(PLAYER_COLORS[4])
    expect(setColor(room, 'p2', '#123456').ok).toBe(false)
    expect(setColor(room, 'nadie', PLAYER_COLORS[3]).ok).toBe(false)
  })
})
