import { useEffect, useRef, useState } from 'react'
import { BOARD, applyAction, createGame, currentPlayer, isBuyable, priceOf } from '../engine'
import type { Action, GameState, TradeOffer } from '../engine'
import { describeEvent, describeSide } from '../lib/describe'
import { PLAYER_COLORS } from '../lib/layout'
import Avatar from './Avatar'
import Board from './Board'
import type { Seat } from './Board'
import TradeModal from './TradeModal'
import { cardPaysPlayer, isNegativeCard, sfxForEvent } from '../lib/sfxEvents'
import { durationOf, play } from '../lib/sfx'
import type { SfxHandle } from '../lib/sfx'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const d6 = () => Math.floor(Math.random() * 6) + 1
const clampDie = (n: number) => Math.min(6, Math.max(1, Math.round(n) || 1))

const TURN_SECONDS = 60
/** Tiempo máximo que se muestra la carta antes de seguir (se puede cerrar antes con un clic) */
const CARD_SECONDS = 4.5

interface Props {
  seats: Seat[]
  onExit: () => void
  onSettings: () => void
}

/** Partida local de prueba: el developer tira los dados de todos los turnos. */
export default function DevGame({ seats, onExit, onSettings: _onSettings }: Props) {
  const [game, setGame] = useState<GameState>(() => createGame(seats.map((s) => ({ id: s.id, name: s.name }))))
  const [shown, setShown] = useState<Record<string, number>>(() => Object.fromEntries(seats.map((s) => [s.id, 0])))
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>(['Partida de prueba iniciada'])
  const [logExpanded, setLogExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const [dice, setDice] = useState<[number, number]>([1, 1])
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS)
  const [reveal, setReveal] = useState<{ deck: 'chance' | 'chest'; text: string } | null>(null)
  const [tradeOpen, setTradeOpen] = useState(false)
  const [rollFaces, setRollFaces] = useState<[number, number] | null>(null)
  const [timeoutDur, setTimeoutDur] = useState(0)
  const closeReveal = useRef<(() => void) | null>(null)
  const alive = useRef(true)
  const logRef = useRef<HTMLOListElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // Duración del audio de cuenta regresiva (su último segundo coincide con el final del turno)
  useEffect(() => {
    void durationOf('timerout').then((d) => {
      setTimeoutDur(d)
    })
  }, [])

  // Scroll al fondo del log expandido cuando llegan nuevas líneas
  useEffect(() => {
    if (logExpanded) {
      const el = logRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [log, logExpanded])

  // Timer de turno: solo corre en fase 'roll' y sin busy
  useEffect(() => {
    if (game.phase !== 'roll' || busy) {
      if (timerRef.current) clearInterval(timerRef.current)
      setTimeLeft(TURN_SECONDS)
      return
    }
    setTimeLeft(TURN_SECONDS)
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return t - 1
      })
    }, 1000)
    // Cuenta regresiva: arranca justo cuando falta lo que dura el audio, así termina con el turno
    const startedAt = performance.now()
    const dur = timeoutDur
    let handle: SfxHandle | null = null
    const beep =
      dur > 0 && dur < TURN_SECONDS
        ? setTimeout(() => {
            handle = play('timerout', { variant: 0 })
          }, (TURN_SECONDS - dur) * 1000)
        : null
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (beep) clearTimeout(beep)
      // Si el turno termina antes, se corta; si venció el tiempo, se deja sonar hasta el final
      if (handle && performance.now() - startedAt < TURN_SECONDS * 1000 - 300) handle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.phase, game.current, busy, timeoutDur])

  // Cuando el timer llega a 0, auto-tirar dados aleatorios
  useEffect(() => {
    if (timeLeft === 0 && game.phase === 'roll' && !busy) {
      void rollDice()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft])

  const colors = Object.fromEntries(seats.map((s, i) => [s.id, PLAYER_COLORS[i % PLAYER_COLORS.length]]))
  const nameOf = (id: string) => seats.find((s) => s.id === id)?.name ?? id
  const me = currentPlayer(game)
  const tile = BOARD[me.position]
  const locked = busy || game.phase === 'over'

  const dispatch = async (action: Action, force = false) => {
    if (busy && !force) return
    const r = applyAction(game, action)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError(null)
    setBusy(true)
    // Si sale una carta, el resultado (plata, fase, etc.) se muestra recién cuando se cierra la carta.
    const hasCard = r.events.some((e) => e.type === 'card-drawn')
    if (!hasCard) setGame(r.state)
    for (const e of r.events) {
      if (!alive.current) return
      if (e.type === 'moved') {
        if (e.steps > 0) play('Slice')
        for (let k = 1; k <= e.steps; k++) {
          setShown((p) => ({ ...p, [e.player]: (e.from + k) % 40 }))
          await sleep(130)
        }
      } else if (e.type === 'jailed') {
        await sleep(250)
        setShown((p) => ({ ...p, [e.player]: 10 }))
      } else if (e.type === 'card-drawn') {
        play('cardtaken')
        // "neg" suena cuando la carta termina de darse vuelta (la animación de vuelo dura ~1,1 s)
        const negTimer = isNegativeCard(e.deck, e.cardId) ? setTimeout(() => play('neg'), 900) : null
        await showCard(e.deck, e.text)
        if (negTimer) clearTimeout(negTimer)
        setGame(r.state)
        if (cardPaysPlayer(e.deck, e.cardId)) play('moneycollected')
      }
      if (e.type === 'moved' && e.passedGo) play('moneycollected')
      const sfx = sfxForEvent(e, action.player)
      if (sfx) {
        play(sfx)
        // Si la partida termina por una quiebra, deja oír "Lose" antes de la victoria
        if (e.type === 'bankrupt' && r.events.some((x) => x.type === 'won')) await sleep(1100)
      }
      // El registro va al ritmo de la animación (así la carta no se "spoilea")
      const line = describeEvent(e, nameOf)
      if (line) setLog((l) => [...l, line])
    }
    if (alive.current) {
      setShown(Object.fromEntries(r.state.players.map((p) => [p.id, p.position])))
      setBusy(false)
    }
  }

  /** Muestra la carta robada y espera a que pase el tiempo o se cierre con un clic. */
  const showCard = (deck: 'chance' | 'chest', text: string) =>
    new Promise<void>((resolve) => {
      setReveal({ deck, text })
      const done = () => {
        clearTimeout(timer)
        closeReveal.current = null
        setReveal(null)
        resolve()
      }
      const timer = setTimeout(done, CARD_SECONDS * 1000)
      closeReveal.current = done
    })

  const propose = (offer: TradeOffer) => {
    setTradeOpen(false)
    void dispatch({ type: 'proposeTrade', player: offer.from, to: offer.to, give: offer.give, get: offer.get })
  }

  /** Muestra números al azar en los dados hasta que termina el sonido y recién ahí aplica la tirada. */
  const rollDice = async () => {
    if (busy) return
    const [a, b] = manual ? [clampDie(dice[0]), clampDie(dice[1])] : [d6(), d6()]
    setBusy(true)
    const spin = setInterval(() => setRollFaces([d6(), d6()]), 85)
    setRollFaces([d6(), d6()])
    const started = performance.now()
    await play('Dados').ended
    const rest = 700 - (performance.now() - started) // mínimo de animación si no hay audio
    if (rest > 0) await sleep(rest)
    clearInterval(spin)
    if (!alive.current) return
    setRollFaces(null)
    await dispatch({ type: 'roll', player: me.id, dice: [a, b] }, true)
  }

  const timerUrgent = timeLeft <= 10 && game.phase === 'roll' && !busy
  const shownLog = logExpanded ? log : log.slice(-3)

  return (
    <div className="game">
      <Board
        game={game}
        seats={seats}
        shown={shown}
        colors={colors}
        drawable={game.phase === 'card' && !busy ? game.pendingCard?.deck ?? null : null}
        onDraw={() => void dispatch({ type: 'drawCard', player: me.id })}
        rollFaces={rollFaces}
        reveal={reveal}
        onCloseReveal={() => closeReveal.current?.()}
      />

      <aside className="side">
        <section className="panel-card">
          <h3>Jugadores</h3>
          <ul className="plist">
            {game.players.map((p, i) => {
              const seat = seats[i]
              const props = Object.entries(game.owned).filter(([, o]) => o.owner === p.id)
              return (
                <li key={p.id} className={`${i === game.current && game.phase !== 'over' ? 'turn' : ''} ${p.bankrupt ? 'out' : ''}`}>
                  <span className="pdot" style={{ background: colors[p.id] }} />
                  <Avatar name={seat.name} src={seat.avatar} size={24} />
                  <span className="pname">
                    {p.name}
                    {p.inJail && <em> · cárcel</em>}
                    {p.bankrupt && <em> · quebró</em>}
                  </span>
                  <span className="pcash">${p.cash}</span>
                  {props.length > 0 && (
                    <span className="pprops">
                      {props.map(([pos]) => BOARD[Number(pos)].name).join(' · ')}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        {game.trade && game.phase !== 'over' && (
          <section className="offer-banner">
            <h3>
              Oferta: {nameOf(game.trade.from)} → {nameOf(game.trade.to)}
            </h3>
            <p>
              {nameOf(game.trade.from)} da <strong>{describeSide(game.trade.give)}</strong> y pide{' '}
              <strong>{describeSide(game.trade.get)}</strong>.
            </p>
            <div className="row3">
              <button className="btn primary sm" disabled={busy} onClick={() => void dispatch({ type: 'acceptTrade', player: game.trade!.to })}>
                {nameOf(game.trade.to)} acepta
              </button>
              <button className="btn ghost sm" disabled={busy} onClick={() => void dispatch({ type: 'rejectTrade', player: game.trade!.to })}>
                Rechaza
              </button>
              <button className="link" disabled={busy} onClick={() => void dispatch({ type: 'cancelTrade', player: game.trade!.from })}>
                Retirar
              </button>
            </div>
          </section>
        )}

        <section className="panel-card">
          {game.phase === 'over' ? (
            <>
              <h3>¡Ganó {nameOf(game.winner ?? '')}!</h3>
              <button className="btn primary" onClick={onExit}>
                Volver al menú
              </button>
            </>
          ) : (
            <>
              <div className="turn-header">
                <h3>Turno de {me.name}</h3>
                {game.phase === 'roll' && !busy && (
                  <span className={`timer${timerUrgent ? ' urgent' : ''}`}>{timeLeft}s</span>
                )}
              </div>
              <p className="muted">
                Estás en {tile.name}
                {game.phase === 'roll' && game.rollAgain ? ' · sacó dobles, tira de nuevo' : ''}
              </p>

              {game.phase === 'roll' && (
                <div className="stack">
                  <button className="btn primary" disabled={locked} onClick={rollDice}>
                    Tirar dados por {me.name}
                  </button>
                  {me.inJail && (
                    <div className="row2">
                      <button className="btn ghost" disabled={locked} onClick={() => void dispatch({ type: 'payJailFine', player: me.id })}>
                        Pagar ${game.rules.jailFine}
                      </button>
                      <button className="btn ghost" disabled={locked || me.jailCards < 1} onClick={() => void dispatch({ type: 'useJailCard', player: me.id })}>
                        Usar carta
                      </button>
                    </div>
                  )}
                  <label className="check">
                    <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> Dados manuales
                  </label>
                  {manual && (
                    <div className="row2">
                      {[0, 1].map((i) => (
                        <input
                          key={i}
                          className="input"
                          type="number"
                          min={1}
                          max={6}
                          value={dice[i]}
                          onChange={(e) => setDice((d) => (i === 0 ? [Number(e.target.value), d[1]] : [d[0], Number(e.target.value)]))}
                          aria-label={`Dado ${i + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {game.phase === 'buy' && isBuyable(tile) && (
                <div className="stack">
                  <button className="btn primary" disabled={locked || me.cash < priceOf(tile)} onClick={() => void dispatch({ type: 'buy', player: me.id })}>
                    Comprar {tile.name} (${priceOf(tile)})
                  </button>
                  <button className="btn ghost" disabled={locked} onClick={() => void dispatch({ type: 'decline', player: me.id })}>
                    No comprar
                  </button>
                </div>
              )}

              {game.phase === 'card' && game.pendingCard && (
                <div className="stack">
                  <p className="card-label">{game.pendingCard.deck === 'chance' ? '❓ Suerte' : '📦 Arcas del discord'}</p>
                  <p className="muted">Hacé clic en el mazo del tablero (o en el botón) para sacar una carta.</p>
                  <button className="btn primary" disabled={locked} onClick={() => void dispatch({ type: 'drawCard', player: me.id })}>
                    Sacar carta
                  </button>
                </div>
              )}

              {game.phase === 'end' && (
                <button className="btn primary" disabled={locked} onClick={() => void dispatch({ type: 'endTurn', player: me.id })}>
                  Terminar turno
                </button>
              )}

              {error && <p className="err">{error}</p>}

              <button className="btn ghost sm" disabled={locked || !!game.trade} onClick={() => setTradeOpen(true)}>
                🤝 Intercambiar
              </button>

              <button
                className="link danger"
                disabled={locked}
                onClick={() => window.confirm(`¿${me.name} se declara en bancarrota?`) && void dispatch({ type: 'bankrupt', player: me.id })}
              >
                Declarar bancarrota
              </button>
            </>
          )}
        </section>

        <section className="panel-card log-panel">
          <div className="log-header">
            <h3>Registro</h3>
            <button className="link log-toggle" onClick={() => setLogExpanded((v) => !v)}>
              {logExpanded ? 'Colapsar ▲' : `Ver todo (${log.length}) ▼`}
            </button>
          </div>
          <ol className={`log${logExpanded ? ' log-expanded' : ''}`} ref={logRef}>
            {shownLog.map((l, i) => (
              <li key={logExpanded ? i : log.length - shownLog.length + i}>{l}</li>
            ))}
          </ol>
        </section>

        <button className="link" onClick={onExit}>
          Salir de la partida de prueba
        </button>
      </aside>

      {tradeOpen && (
        <TradeModal
          game={game}
          seats={seats}
          colors={colors}
          defaultFrom={me.id}
          onPropose={propose}
          onClose={() => setTradeOpen(false)}
        />
      )}
    </div>
  )
}
