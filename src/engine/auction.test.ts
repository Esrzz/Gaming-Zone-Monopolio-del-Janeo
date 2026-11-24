import { describe, expect, it } from 'vitest'
import { applyAction, createGame, currentPlayer, timeoutAction } from './engine'
import { advanceClock, AUCTION_MS, isDue, nextDeadline } from './clock'
import { BOARD } from './board'
import type { Action, GameState } from './types'

const POS = BOARD.findIndex((t) => t.kind === 'property')
const act = (s: GameState, a: Action) => {
  const r = applyAction(s, a, { clientDice: false })
  if (!r.ok) throw new Error(r.error)
  return r
}
/** Partida de 3 donde el jugador de turno cayó en una propiedad libre y la rechazó */
const auctionGame = (cash = [1500, 1500, 1500]): GameState => {
  let s = createGame(['a', 'b', 'c'].map((id) => ({ id, name: id })), {}, 5)
  s.players.forEach((p, i) => (p.cash = cash[i]))
  s.players[0].position = POS
  s.phase = 'buy'
  s = act(s, { type: 'decline', player: 'a' }).state
  return s
}

describe('subasta', () => {
  it('rechazar la compra abre una subasta y bloquea el resto de las acciones', () => {
    const s = auctionGame()
    expect(s.auction).toEqual({ tile: POS, bid: 0, leader: null, passed: [] })
    expect(applyAction(s, { type: 'endTurn', player: 'a' }).ok).toBe(false)
    expect(applyAction(s, { type: 'build', player: 'a', tile: POS }).ok).toBe(false)
  })

  it('gana el que más ofrece, paga su oferta y el turno sigue', () => {
    let s = auctionGame()
    s = act(s, { type: 'bid', player: 'b', amount: 50 }).state // cualquiera puede ofrecer, no solo el de turno
    s = act(s, { type: 'bid', player: 'c', amount: 120 }).state
    s = act(s, { type: 'passAuction', player: 'a' }).state
    const r = act(s, { type: 'passAuction', player: 'b' })
    expect(r.state.auction).toBeNull()
    expect(r.state.owned[POS]).toEqual({ owner: 'c', mortgaged: false, houses: 0 })
    expect(r.state.players.find((p) => p.id === 'c')!.cash).toBe(1380)
    expect(r.state.phase).toBe('end')
    expect(r.events.some((e) => e.type === 'auctionWon')).toBe(true)
  })

  it('no se puede ofrecer menos, igual, más de lo que tenés, ni retirarse siendo líder', () => {
    let s = auctionGame([1500, 100, 1500])
    s = act(s, { type: 'bid', player: 'c', amount: 60 }).state
    expect(applyAction(s, { type: 'bid', player: 'a', amount: 60 }).ok).toBe(false)
    expect(applyAction(s, { type: 'bid', player: 'a', amount: 2000 }).ok).toBe(false)
    expect(applyAction(s, { type: 'bid', player: 'a', amount: 10.5 }).ok).toBe(false)
    expect(applyAction(s, { type: 'bid', player: 'c', amount: 70 }).ok).toBe(false) // ya es el líder
    expect(applyAction(s, { type: 'passAuction', player: 'c' }).ok).toBe(false)
  })

  it('los que no llegan a superar la oferta se retiran solos', () => {
    let s = auctionGame([1500, 100, 40])
    s = act(s, { type: 'bid', player: 'a', amount: 100 }).state // b tiene 100 (no supera) y c 40: quedan afuera
    expect(s.auction).toBeNull()
    expect(s.owned[POS]?.owner).toBe('a')
  })

  it('si todos se retiran sin ofertas la propiedad queda libre y el turno sigue', () => {
    let s = auctionGame()
    s = act(s, { type: 'passAuction', player: 'a' }).state
    s = act(s, { type: 'passAuction', player: 'b' }).state
    const r = act(s, { type: 'passAuction', player: 'c' })
    expect(r.state.auction).toBeNull()
    expect(r.state.owned[POS]).toBeUndefined()
    expect(r.state.phase).toBe('end')
    expect(r.events.some((e) => e.type === 'auctionUnsold')).toBe(true)
  })

  it('con dobles, después de la subasta se vuelve a tirar', () => {
    let s = createGame(['a', 'b'].map((id) => ({ id, name: id })), {}, 5)
    s.players[0].position = POS
    s.phase = 'buy'
    s.rollAgain = true
    s = act(s, { type: 'decline', player: 'a' }).state
    s = act(s, { type: 'passAuction', player: 'a' }).state
    s = act(s, { type: 'passAuction', player: 'b' }).state
    expect(s.phase).toBe('roll')
  })

  it('el tiempo agotado cierra la subasta con la mejor oferta', () => {
    let s = auctionGame()
    expect(timeoutAction(s)).toEqual({ type: 'closeAuction', player: currentPlayer(s).id })
    s = act(s, { type: 'bid', player: 'b', amount: 30 }).state
    s = act(s, timeoutAction(s)!).state
    expect(s.owned[POS]?.owner).toBe('b')
    expect(auctionGame().auction).not.toBeNull()
  })

  it('si el líder quiebra su oferta se cae; si quiebra el que rechazó, el turno sigue sin trabarse', () => {
    let s = auctionGame()
    s = act(s, { type: 'bid', player: 'b', amount: 80 }).state
    s = act(s, { type: 'bankrupt', player: 'b' }).state
    expect(s.auction).toMatchObject({ bid: 0, leader: null })
    s = act(s, { type: 'bankrupt', player: 'a' }).state // a era el de turno: pasa a c, y c queda solo
    expect(s.phase).toBe('over')
    expect(s.auction).toBeNull()
  })

  it('si quiebra el que rechazó con 3 jugadores, la subasta sigue y después juega el siguiente', () => {
    let s = createGame(['a', 'b', 'c', 'd'].map((id) => ({ id, name: id })), {}, 5)
    s.players[0].position = POS
    s.phase = 'buy'
    s = act(s, { type: 'decline', player: 'a' }).state
    s = act(s, { type: 'bankrupt', player: 'a' }).state
    expect(s.auction).not.toBeNull()
    expect(currentPlayer(s).id).toBe('b')
    for (const id of ['b', 'c', 'd']) s = act(s, { type: 'passAuction', player: id }).state
    expect(s.auction).toBeNull()
    expect(s.phase).toBe('roll') // el turno de b no se pisa
  })

  it('el reloj pausa el turno durante la subasta y se reinicia con cada oferta', () => {
    let s = auctionGame()
    let c = advanceClock({ player: null, turnEndsAt: null, turnPausedMs: null, tradeEndsAt: null, tradeTo: null }, createGame(['a', 'b', 'c'].map((id) => ({ id, name: id })), {}, 5), 0)
    c = advanceClock(c, s, 1000)
    expect(c.auctionEndsAt).toBe(1000 + AUCTION_MS)
    expect(c.turnEndsAt).toBeNull()
    expect(isDue(c, 1000 + AUCTION_MS - 1)).toBe(false)
    expect(isDue(c, 1000 + AUCTION_MS)).toBe(true)
    s = act(s, { type: 'bid', player: 'b', amount: 10 }).state
    c = advanceClock(c, s, 15_000)
    expect(nextDeadline(c)).toBe(15_000 + AUCTION_MS)
    s = act(s, { type: 'closeAuction', player: 'a' }).state
    c = advanceClock(c, s, 20_000)
    expect(c.auctionEndsAt).toBeNull()
    expect(c.turnEndsAt).not.toBeNull()
  })

  it('un cliente no puede cerrar la subasta (acción reservada al servidor)', async () => {
    const { isServerOnly } = await import('./engine')
    expect(isServerOnly({ type: 'closeAuction', player: 'a' })).toBe(true)
  })
})
