import { useEffect, useRef, useState } from 'react'
import { BOARD, applyAction, createGame, currentPlayer, isBuyable, priceOf } from '../engine'
import { getCard } from '../engine/cards'
import type { Action, GameState } from '../engine'
import { describeEvent } from '../lib/describe'
import { PLAYER_COLORS } from '../lib/layout'
import Avatar from './Avatar'
import Board from './Board'
import type { Seat } from './Board'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const d6 = () => Math.floor(Math.random() * 6) + 1
const clampDie = (n: number) => Math.min(6, Math.max(1, Math.round(n) || 1))

const TURN_SECONDS = 60

interface Props {
  seats: Seat[]
  onExit: () => void
}

/** Partida local de prueba: el developer tira los dados de todos los turnos. */
export default function DevGame({ seats, onExit }: Props) {
  const [game, setGame] = useState<GameState>(() => createGame(seats.map((s) => ({ id: s.id, name: s.name }))))
  const [shown, setShown] = useState<Record<string, number>>(() => Object.fromEntries(seats.map((s) => [s.id, 0])))
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>(['Partida de prueba iniciada'])
  const [logExpanded, setLogExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const [dice, setDice] = useState<[number, number]>([1, 1])
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS)
  const alive = useRef(true)
  const logRef = useRef<HTMLOListElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
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
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.phase, game.current, busy])

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

  const dispatch = async (action: Action) => {
    if (busy) return
    const r = applyAction(game, action)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError(null)
    setGame(r.state)
    setLog((l) => [...l, ...r.events.flatMap((e) => describeEvent(e, nameOf) ?? [])])
    setBusy(true)
    for (const e of r.events) {
      if (!alive.current) return
      if (e.type === 'moved') {
        for (let k = 1; k <= e.steps; k++) {
          setShown((p) => ({ ...p, [e.player]: (e.from + k) % 40 }))
          await sleep(130)
        }
      } else if (e.type === 'jailed') {
        await sleep(250)
        setShown((p) => ({ ...p, [e.player]: 10 }))
      }
    }
    if (alive.current) {
      setShown(Object.fromEntries(r.state.players.map((p) => [p.id, p.position])))
      setBusy(false)
    }
  }

  const rollDice = () => {
    const [a, b] = manual ? [clampDie(dice[0]), clampDie(dice[1])] : [d6(), d6()]
    void dispatch({ type: 'roll', player: me.id, dice: [a, b] })
  }

  const timerUrgent = timeLeft <= 10 && game.phase === 'roll' && !busy
  const shownLog = logExpanded ? log : log.slice(-3)

  return (
    <div className="game">
      <Board game={game} seats={seats} shown={shown} colors={colors} />

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
                  <Avatar name={seat.name} src={seat.avatar} size={30} />
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

              {game.phase === 'card' && game.pendingCard && (() => {
                const card = getCard(game.pendingCard.deck, game.pendingCard.deck === 'chance' ? game.chanceIndex - 1 : game.chestIndex - 1)
                return (
                  <div className="stack">
                    <p className="card-label">{game.pendingCard.deck === 'chance' ? '🎲 Suerte' : '📦 Arca Comunal'}</p>
                    <p className="card-text">"{card.text}"</p>
                    <button className="btn primary" disabled={locked} onClick={() => void dispatch({ type: 'drawCard', player: me.id })}>
                      Aplicar carta
                    </button>
                  </div>
                )
              })()}

              {game.phase === 'end' && (
                <button className="btn primary" disabled={locked} onClick={() => void dispatch({ type: 'endTurn', player: me.id })}>
                  Terminar turno
                </button>
              )}

              {error && <p className="err">{error}</p>}

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
    </div>
  )
}
