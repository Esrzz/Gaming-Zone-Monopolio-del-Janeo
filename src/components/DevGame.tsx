import { useEffect, useRef, useState } from 'react'
import { BOARD, applyAction, createGame, currentPlayer, isBuyable, isManageAction, priceOf, timeoutAction } from '../engine'
import type { Action, GameEvent, GameState, TradeOffer } from '../engine'
import { describeEvent } from '../lib/describe'
import { PLAYER_COLORS } from '../lib/layout'
import Avatar from './Avatar'
import Board from './Board'
import type { Seat } from './Board'
import ManageModal from './ManageModal'
import TradeModal from './TradeModal'
import type { PropertyView } from './PropertyCard'
import { cardPaysPlayer, isNegativeCard, sfxForEvent } from '../lib/sfxEvents'
import { knownDuration, play } from '../lib/sfx'
import { moneyChanges } from '../lib/moneyFx'
import type { SfxHandle } from '../lib/sfx'
import type { OnlineLink } from '../lib/onlineLink'
import { tileDot } from '../lib/tileColor'
import TradeOverlay from './TradeOverlay'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const d6 = () => Math.floor(Math.random() * 6) + 1
const clampDie = (n: number) => Math.min(6, Math.max(1, Math.round(n) || 1))

/** Tiempo total de cada turno (corre durante todo el turno, no solo al tirar). Configurable con VITE_TURN_SECONDS. */
const TURN_SECONDS = Number(import.meta.env.VITE_TURN_SECONDS) || 240
/** Tiempo que tiene quien recibe una oferta de intercambio para responderla (si no, se rechaza). */
const TRADE_SECONDS = Number(import.meta.env.VITE_TRADE_SECONDS) || 60
/** Tiempo máximo que se muestra la carta antes de seguir (se puede cerrar antes con un clic) */
const CARD_SECONDS = 8
/** Tiempo para pagar un alquiler en la tarjeta de propiedad (si no, se paga solo) */
const PAY_SECONDS = 10
/** Duración de cada paso de ficha, y tope del recorrido completo (los largos van más rápido) */
const STEP_MS = 220
const MAX_MOVE_MS = 3800
/** Con "acelerar" (clic en los dados) cada paso dura esto */
const FAST_STEP_MS = 35
const FLOAT_MS = 1800
/**
 * Segundos que faltan cuando suena el primer tick de la cuenta regresiva. El audio tiene un tick por segundo
 * (a los 0, 1, 2 y 3 s) y el último segundo en silencio, así que con 3 los ticks caen en 3, 2, 1 y 0 s restantes.
 */
const TIMEROUT_LEAD_S = 3

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

interface Props {
  seats: Seat[]
  onExit: () => void
  onSettings: () => void
  /** Partida online: el servidor decide y esta pantalla solo envía acciones y anima lo que llega */
  online?: OnlineLink
}

interface Floating {
  id: number
  player: string
  amount: number
}

/** Partida local de prueba: el developer tira los dados de todos los turnos. */
export default function DevGame({ seats, onExit, onSettings: _onSettings, online }: Props) {
  const [game, setGame] = useState<GameState>(() => online?.initial ?? createGame(seats.map((s) => ({ id: s.id, name: s.name }))))
  const [shown, setShown] = useState<Record<string, number>>(() =>
    Object.fromEntries(seats.map((s) => [s.id, online?.initial.players.find((p) => p.id === s.id)?.position ?? 0])),
  )
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([online ? 'Partida iniciada' : 'Partida de prueba iniciada'])
  const [logExpanded, setLogExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const [dice, setDice] = useState<[number, number]>([1, 1])
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS)
  const [tradeLeft, setTradeLeft] = useState(TRADE_SECONDS)
  const [reveal, setReveal] = useState<{ deck: 'chance' | 'chest'; text: string } | null>(null)
  const [prop, setProp] = useState<PropertyView | null>(null)
  const [floats, setFloats] = useState<Floating[]>([])
  const [tradeOpen, setTradeOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [moving, setMoving] = useState(false)
  const [stepMs, setStepMs] = useState(STEP_MS)
  /** Clic en los dados mientras anima: acelera el resto de la animación */
  const fast = useRef(false)
  const diceSound = useRef<SfxHandle | null>(null)
  const moveSound = useRef<SfxHandle | null>(null)
  const [rollFaces, setRollFaces] = useState<[number, number] | null>(null)
  const spin = useRef<{ iv: ReturnType<typeof setInterval>; ended: Promise<void> } | null>(null)
  /** Cuántos resultados se están animando (online pueden llegar varios seguidos) */
  const playing = useRef(0)
  /** Número de seq del resultado que se está animando (para que los gestos de otros jugadores caigan en la animación correcta) */
  const playingSeq = useRef<number | null>(null)
  const pendingUi = useRef<{ ui: 'fast' | 'closeCard'; seq: number }[]>([])
  const queue = useRef<Promise<void>>(Promise.resolve())
  const closeReveal = useRef<(() => void) | null>(null)
  const payDone = useRef<(() => void) | null>(null)
  const alive = useRef(true)
  const logRef = useRef<HTMLOListElement>(null)
  const floatSeq = useRef(0)
  // Temporizadores: restante en ms del turno y de la respuesta a una oferta
  const turnMs = useRef(TURN_SECONDS * 1000)
  const tradeMs = useRef(TRADE_SECONDS * 1000)
  const firing = useRef(false)
  const beep = useRef<{ key: string; h: SfxHandle } | null>(null)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      beep.current?.h.stop()
    }
  }, [])

  // Scroll al fondo del log expandido cuando llegan nuevas líneas
  useEffect(() => {
    if (logExpanded) {
      const el = logRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [log, logExpanded])

  // Cada turno nuevo arranca con el tiempo completo
  useEffect(() => {
    setManageOpen(false)
    if (online) return // online manda el reloj del servidor
    turnMs.current = TURN_SECONDS * 1000
    setTimeLeft(TURN_SECONDS)
  }, [game.current])

  // Una oferta nueva arranca el reloj de quien la recibe (el del turno queda en pausa)
  const tradeKey = game.trade ? `${game.trade.from}>${game.trade.to}` : ''
  useEffect(() => {
    if (online) return
    tradeMs.current = TRADE_SECONDS * 1000
    setTradeLeft(TRADE_SECONDS)
  }, [tradeKey])

  const colors = Object.fromEntries(seats.map((s, i) => [s.id, PLAYER_COLORS[i % PLAYER_COLORS.length]]))
  const nameOf = (id: string) => seats.find((s) => s.id === id)?.name ?? id
  const me = currentPlayer(game)
  const tile = BOARD[me.position]
  const owing = game.debts.some((d) => d.from === me.id)
  const debt = game.debts.find((d) => d.from === me.id)
  /** En online solo actuás en tu turno; en la partida de prueba el developer maneja a todos */
  const mine = !online || me.id === online.you
  const locked = busy || game.phase === 'over' || !mine

  const addFloat = (player: string, amount: number) => {
    const id = ++floatSeq.current
    setFloats((l) => [...l, { id, player, amount }])
    setTimeout(() => setFloats((l) => l.filter((f) => f.id !== id)), FLOAT_MS)
  }

  const openProp = (view: PropertyView) => {
    play('cardtaken')
    setProp(view)
  }

  const propInfo = (pos: number, mode: PropertyView['mode'], extra: Partial<PropertyView> = {}): PropertyView => {
    const o = game.owned[pos]
    return { pos, mode, ownerName: o ? nameOf(o.owner) : null, houses: o?.houses, mortgaged: o?.mortgaged, cash: me.cash, ...extra }
  }

  const dispatch = async (action: Action, force = false) => {
    if (busy && !force) return
    if (!force) fast.current = false
    if (online) {
      // El servidor decide: se manda la acción y el resultado llega por `subscribe` (playResult)
      setError(null)
      if (!isManageAction(action)) setProp(null)
      if (!online.send(action)) {
        setError('Sin conexión con el servidor, esperá a que se reconecte')
        return
      }
      setBusy(true)
      return
    }
    const r = applyAction(game, action)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError(null)
    setBusy(true)
    if (!isManageAction(action)) setProp(null)
    await playResult(r.state, r.events, action.player)
  }

  /** Anima un resultado (local o del servidor): fichas, cartas, alquileres, sonidos, plata y registro. */
  const playResult = async (state: GameState, events: GameEvent[], actor: string, auto = false) => {
    playing.current += 1
    playingSeq.current = state.seq
    // gestos de otros jugadores que llegaron antes de empezar esta animación
    if (pendingUi.current.some((u) => u.ui === 'fast' && u.seq === state.seq)) fast.current = true
    setBusy(true)
    if (online && events.some((e) => e.type === 'rolled')) {
      // la tirada de otro jugador (o la propia, ya girando): los dados giran hasta que termina el sonido
      if (!spin.current) startSpin()
      await spin.current!.ended
      stopSpin()
    }
    // Si sale una carta o hay que pagar un alquiler, el resultado (plata, fase, etc.) se muestra recién después.
    let applied = false
    const apply = () => {
      if (!applied) {
        applied = true
        setGame(state)
      }
    }
    if (!events.some((e) => e.type === 'card-drawn' || e.type === 'rent')) apply()
    for (const e of events) {
      if (!alive.current) return
      if (e.type === 'moved') {
        if (e.steps > 0) {
          const step = Math.min(STEP_MS, MAX_MOVE_MS / e.steps)
          const moveMs = e.steps * step
          // El sonido se acelera o frena para que dure lo mismo que el recorrido
          const clip = knownDuration('Slice') * 1000
          const rate = clip > 0 ? Math.min(2.2, Math.max(0.6, clip / moveMs)) : 1
          setStepMs(step)
          setMoving(true)
          const h = (moveSound.current = fast.current ? null : play('Slice', { rate }))
          for (let k = 1; k <= e.steps; k++) {
            if (fast.current) setStepMs(FAST_STEP_MS)
            setShown((p) => ({ ...p, [e.player]: (e.from + k) % 40 }))
            await sleep(fast.current ? FAST_STEP_MS : step)
          }
          setMoving(false)
          h?.stop(120) // si el sonido era más largo que el recorrido, se corta suave al llegar
          moveSound.current = null
        }
      } else if (e.type === 'jailed') {
        await sleep(250)
        setShown((p) => ({ ...p, [e.player]: 10 }))
      } else if (e.type === 'card-drawn' && auto) {
        // tirada automática por tiempo agotado: no se levanta la carta, solo queda en el registro
        if (cardPaysPlayer(e.deck, e.cardId)) play('moneycollected')
        else if (isNegativeCard(e.deck, e.cardId)) play('neg')
      } else if (e.type === 'card-drawn') {
        play('cardtaken')
        // "neg" suena cuando la carta termina de darse vuelta (la animación de vuelo dura ~1,1 s)
        const negTimer = isNegativeCard(e.deck, e.cardId) ? setTimeout(() => play('neg'), 900) : null
        await showCard(e.deck, e.text)
        if (negTimer) clearTimeout(negTimer)
        apply()
        if (cardPaysPlayer(e.deck, e.cardId)) play('moneycollected')
      } else if (e.type === 'rent' && !auto) {
        await showRent(e.tile, e.amount, nameOf(e.to), actor)
        apply()
      }
      for (const c of moneyChanges(e, state.rules)) addFloat(c.player, c.amount)
      const sfx = sfxForEvent(e, actor)
      if (sfx) {
        play(sfx)
        // Si la partida termina por una quiebra, deja oír "Lose" antes de la victoria
        if (e.type === 'bankrupt' && events.some((x) => x.type === 'won')) await sleep(1100)
      }
      // El registro va al ritmo de la animación (así la carta no se "spoilea")
      const line =
        auto && e.type === 'rolled' ? `${nameOf(e.player)} sacó ${e.dice[0]} y ${e.dice[1]} (tirada automática)` : describeEvent(e, nameOf)
      if (line) setLog((l) => [...l, line])
    }
    apply()
    playing.current -= 1
    playingSeq.current = null
    pendingUi.current = pendingUi.current.filter((u) => u.seq > state.seq)
    if (alive.current) {
      setShown(Object.fromEntries(state.players.map((p) => [p.id, p.position])))
      setBusy(playing.current > 0)
      // hay que juntar plata (online: solo si la deuda es tuya)
      if (state.debts.some((d) => !online || d.from === online.you)) setManageOpen(true)
      // Cayó en una propiedad libre: la tarjeta sale de la casilla con la opción de comprar (online: solo a quien le toca)
      const cur = state.players[state.current]
      if (state.phase === 'buy' && (!online || cur.id === online.you)) {
        const pos = cur.position
        const o = state.owned[pos]
        openProp({ pos, mode: 'buy', ownerName: o ? nameOf(o.owner) : null, cash: cur.cash })
      }
    }
  }

  /** Muestra la carta robada y espera a que pase el tiempo o se cierre con un clic. */
  const showCard = (deck: 'chance' | 'chest', text: string) =>
    new Promise<void>((resolve) => {
      if (pendingUi.current.some((u) => u.ui === 'closeCard' && u.seq === playingSeq.current)) return resolve() // otro jugador ya la cerró
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

  /** Tarjeta de la propiedad donde se cayó, con el botón de pagar el alquiler (se paga sola si pasa el tiempo). */
  const showRent = (pos: number, amount: number, ownerName: string, actor: string) =>
    new Promise<void>((resolve) => {
      // online: solo quien paga confirma; los demás ven la tarjeta un instante
      const watching = !!online && actor !== online.you
      if (watching) openProp(propInfo(pos, 'info', { cash: undefined }))
      else openProp({ pos, mode: 'pay', amount, ownerName, houses: game.owned[pos]?.houses, cash: me.cash })
      const done = () => {
        clearTimeout(timer)
        payDone.current = null
        setProp(null)
        resolve()
      }
      const timer = setTimeout(done, (watching ? 2500 : PAY_SECONDS * 1000))
      payDone.current = done
    })

  const propose = (offer: TradeOffer) => {
    setTradeOpen(false)
    void dispatch({ type: 'proposeTrade', player: offer.from, to: offer.to, give: offer.give, get: offer.get })
  }

  /** Muestra números al azar en los dados hasta que termina el sonido (o hasta un clic para acelerar). */
  const startSpin = () => {
    const iv = setInterval(() => setRollFaces([d6(), d6()]), 85)
    setRollFaces([d6(), d6()])
    const started = performance.now()
    const h = (diceSound.current = play('Dados'))
    const ended = (async () => {
      await h.ended // termina con el sonido, o antes si se hace clic en los dados
      diceSound.current = null
      const rest = 700 - (performance.now() - started) // mínimo de animación si no hay audio
      if (rest > 0 && !fast.current) await sleep(rest)
    })()
    spin.current = { iv, ended }
  }
  const stopSpin = () => {
    if (spin.current) clearInterval(spin.current.iv)
    spin.current = null
    setRollFaces(null)
    fast.current = false // acelerar los dados no acelera también la ficha
  }

  const rollDice = async () => {
    if (busy) return
    setBusy(true)
    setProp(null)
    fast.current = false
    if (online) {
      // los dados giran mientras el servidor tira; el resultado llega por `subscribe`
      startSpin()
      if (!online.send({ type: 'roll', player: me.id })) {
        diceSound.current?.stop(100)
        stopSpin()
        setBusy(false)
        setError('Sin conexión con el servidor, esperá a que se reconecte')
      }
      return
    }
    const [a, b] = manual ? [clampDie(dice[0]), clampDie(dice[1])] : [d6(), d6()]
    startSpin()
    await spin.current!.ended
    stopSpin()
    if (!alive.current) return
    await dispatch({ type: 'roll', player: me.id, dice: [a, b] }, true)
  }

  /** Clic en los dados: tira (si toca) o acelera la animación en curso (tirada o movimiento de ficha). */
  const diceClick = () => {
    if (rollFaces || moving) {
      fast.current = true
      online?.sendUi('fast', playingSeq.current ?? game.seq + 1)
      diceSound.current?.stop(150)
      moveSound.current?.stop(100)
    } else if (!busy && mine && !owing && game.phase === 'roll') void rollDice()
  }
  const diceAction: 'roll' | 'skip' | null = rollFaces || moving ? 'skip' : !busy && mine && !owing && game.phase === 'roll' ? 'roll' : null

  /** Consultar una propiedad haciendo clic clic en su casilla (en cualquier momento, también fuera de turno). */
  const inspect = (pos: number) => {
    if (reveal || prop?.mode === 'pay') return
    openProp(propInfo(pos, 'info', { cash: undefined }))
  }

  /** Tiempo agotado: se juega la acción que decide el motor (`timeoutAction`; el servidor hará lo mismo). */
  const autoStep = async () => {
    const act = timeoutAction(live.current.game)
    if (!act) return
    if (act.type === 'roll') await live.current.rollDice()
    else await live.current.dispatch(act)
  }

  // Siempre las últimas versiones para el reloj (que corre fuera del ciclo de render)
  const live = useRef({ game, busy, dispatch, rollDice, autoStep, playResult })
  live.current = { game, busy, dispatch, rollDice, autoStep, playResult }

  // Online: lo que manda el servidor se anima de a uno, en orden
  useEffect(() => {
    if (!online) return
    const enqueue = (fn: () => Promise<void>) => {
      queue.current = queue.current.then(fn).catch((err) => console.error(err))
    }
    return online.subscribe((u) => {
      if (u.kind === 'clock') {
        if (u.clock?.turnMsLeft != null) turnMs.current = u.clock.turnMsLeft
        if (u.clock?.tradeMsLeft != null) tradeMs.current = u.clock.tradeMsLeft
      } else if (u.kind === 'error') {
        setError(u.error)
        if (spin.current) {
          diceSound.current?.stop(100)
          stopSpin()
        }
        if (playing.current === 0) setBusy(false)
      } else if (u.kind === 'ui') {
        // el gesto de otro jugador: se aplica a la animación que están viendo todos (o queda pendiente si todavía no empezó)
        if (playingSeq.current === u.seq) {
          if (u.ui === 'fast') {
            fast.current = true
            diceSound.current?.stop(150)
            moveSound.current?.stop(100)
          } else closeReveal.current?.()
        } else if (playingSeq.current === null || u.seq > playingSeq.current) pendingUi.current.push({ ui: u.ui, seq: u.seq })
      } else if (u.kind === 'update') {
        enqueue(() => live.current.playResult(u.state, u.events, currentPlayer(live.current.game).id, u.auto))
      } else {
        enqueue(async () => {
          setGame(u.state)
          setShown(Object.fromEntries(u.state.players.map((p) => [p.id, p.position])))
        })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reloj: corre durante todo el turno; en pausa mientras hay animaciones. Con una oferta abierta, corre el de quien la recibe.
  useEffect(() => {
    let last = performance.now()
    const stopBeep = () => {
      beep.current?.h.stop()
      beep.current = null
    }
    const iv = setInterval(() => {
      const now = performance.now()
      const dt = now - last
      last = now
      const { game: g, busy: b } = live.current
      if (g.phase === 'over' || (b && !online)) return stopBeep()
      const trade = !!g.trade
      const ref = trade ? tradeMs : turnMs
      ref.current = Math.max(0, ref.current - dt)
      setTimeLeft(Math.ceil(turnMs.current / 1000))
      setTradeLeft(Math.ceil(tradeMs.current / 1000))

      // Cuenta regresiva: si se interrumpió (animación, otra oferta) retoma desde el punto que corresponde
      const key = `${trade ? 'trade' : 'turn'}:${g.current}:${g.trade?.to ?? ''}`
      const leadMs = TIMEROUT_LEAD_S * 1000
      if (ref.current > 0 && ref.current <= leadMs) {
        if (beep.current?.key !== key) {
          stopBeep()
          beep.current = { key, h: play('timerout', { variant: 0, startAt: (leadMs - ref.current) / 1000 }) }
        }
      } else if (beep.current && ref.current > leadMs) {
        stopBeep() // el reloj se reinició (acción del jugador, oferta resuelta…)
      }

      if (ref.current <= 0 && !firing.current && !online) {
        firing.current = true
        void live.current.autoStep().finally(() => {
          firing.current = false
        })
      }
    }, 100)
    return () => {
      clearInterval(iv)
      beep.current?.h.stop()
      beep.current = null
    }
  }, [])

  const timerUrgent = timeLeft <= 10 && !busy && !game.trade
  const shownLog = logExpanded ? log : log.slice(-4)

  return (
    <div className="game">
      <Board
        game={game}
        seats={seats}
        shown={shown}
        stepMs={stepMs}
        diceAction={diceAction}
        onDiceClick={diceClick}
        colors={colors}
        drawable={game.phase === 'card' && !busy && mine ? game.pendingCard?.deck ?? null : null}
        onDraw={() => void dispatch({ type: 'drawCard', player: me.id })}
        rollFaces={rollFaces}
        reveal={reveal}
        onCloseReveal={() => {
          closeReveal.current?.()
          online?.sendUi('closeCard', playingSeq.current ?? game.seq)
        }}
        onTileClick={inspect}
        overlay={
          game.trade && game.phase !== 'over' ? (
            <TradeOverlay
              trade={game.trade}
              nameOf={nameOf}
              secondsLeft={tradeLeft}
              role={!online ? 'dev' : game.trade.to === online.you ? 'to' : game.trade.from === online.you ? 'from' : 'watch'}
              busy={busy}
              onAccept={() => void dispatch({ type: 'acceptTrade', player: game.trade!.to })}
              onReject={() => void dispatch({ type: 'rejectTrade', player: game.trade!.to })}
              onCancel={() => void dispatch({ type: 'cancelTrade', player: game.trade!.from })}
            />
          ) : null
        }
        property={
          prop && {
            ...prop,
            onBuy: () => void dispatch({ type: 'buy', player: me.id }),
            onDecline: () => void dispatch({ type: 'decline', player: me.id }),
            onPay: () => payDone.current?.(),
            onClose: () => setProp(null),
          }
        }
      />

      <aside className="side">
        {online?.status === 'reconnecting' && <div className="net-banner">Reconectando con el servidor…</div>}
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
                    {i === game.current && game.phase !== 'over' && !p.bankrupt && <span className="turn-mark">▶</span>}
                    {p.name}
                    {p.inJail && <em> · cárcel</em>}
                    {p.bankrupt && <em> · quebró</em>}
                    {online?.offline.includes(p.id) && !p.bankrupt && <em> · sin conexión</em>}
                  </span>
                  <span className="pcash">${p.cash}</span>
                  {floats
                    .filter((f) => f.player === p.id)
                    .map((f) => (
                      <span key={f.id} className={`mfloat ${f.amount > 0 ? 'gain' : 'loss'}`}>
                        {f.amount > 0 ? '+' : '-'}${Math.abs(f.amount)} 🪙
                      </span>
                    ))}
                  {props.length > 0 && (
                    <span className="pprops">
                      {props
                        .map(([pos]) => Number(pos))
                        .sort((x, y) => x - y)
                        .map((pos) => (
                          <span key={pos} className="pp">
                            <i className="pdotc" style={{ background: tileDot(pos) }} />
                            {BOARD[pos].name}
                          </span>
                        ))}
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
                <span className={`timer${timerUrgent ? ' urgent' : ''}${game.trade ? ' paused' : ''}`} title={game.trade ? 'En pausa: responde la oferta' : 'Tiempo del turno'}>
                  {game.trade ? '⏸ ' : ''}
                  {fmt(timeLeft)}
                </span>
              </div>
              <p className="muted">
                Estás en {tile.name}
                {game.phase === 'roll' && game.rollAgain ? ' · sacó dobles, tira de nuevo' : ''}
              </p>

              {mine && owing && debt && (
                <div className="debt-box">
                  <strong>Tenés una deuda de ${debt.amount}</strong>
                  <span>
                    con {debt.to === 'bank' ? 'el banco' : nameOf(debt.to)}. Juntá plata vendiendo casas o hipotecando (se paga sola) o declarate en bancarrota.
                  </span>
                  <button className="btn primary" disabled={busy} onClick={() => setManageOpen(true)}>
                    🏗️ Gestionar para pagar
                  </button>
                </div>
              )}

              {mine && !owing && game.phase === 'roll' && (
                <div className="stack">
                  <button className="btn primary" disabled={locked} onClick={rollDice}>
                    Tirar dados{online ? '' : ` por ${me.name}`}
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
                  {!online && <label className="check">
                    <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> Dados manuales
                  </label>}
                  {!online && manual && (
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

              {mine && !owing && game.phase === 'buy' && isBuyable(tile) && (
                <div className="stack">
                  <button className="btn primary" disabled={locked || me.cash < priceOf(tile)} onClick={() => void dispatch({ type: 'buy', player: me.id })}>
                    Comprar {tile.name} (${priceOf(tile)})
                  </button>
                  <button className="btn ghost" disabled={locked} onClick={() => void dispatch({ type: 'decline', player: me.id })}>
                    No comprar
                  </button>
                </div>
              )}

              {mine && !owing && game.phase === 'card' && game.pendingCard && (
                <div className="stack">
                  <p className="card-label">{game.pendingCard.deck === 'chance' ? '❓ Suerte' : '📦 Arcas del discord'}</p>
                  <p className="muted">Hacé clic en el mazo del tablero (o en el botón) para sacar una carta.</p>
                  <button className="btn primary" disabled={locked} onClick={() => void dispatch({ type: 'drawCard', player: me.id })}>
                    Sacar carta
                  </button>
                </div>
              )}

              {mine && !owing && game.phase === 'end' && (
                <button className="btn primary" disabled={locked} onClick={() => void dispatch({ type: 'endTurn', player: me.id })}>
                  Terminar turno
                </button>
              )}

              {!mine && <p className="muted">Esperando a {me.name}…</p>}

              {error && <p className="err">{error}</p>}

              <div className="row-btns">
                <button className="btn ghost sm" disabled={locked} onClick={() => setManageOpen(true)}>
                  🏗️ Gestionar
                </button>
                <button className="btn ghost sm" disabled={locked || !!game.trade} onClick={() => setTradeOpen(true)}>
                  🤝 Intercambiar
                </button>
              </div>

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

        {online?.sidebar}

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
          {online ? 'Salir de la partida' : 'Salir de la partida de prueba'}
        </button>
      </aside>

      {manageOpen && (
        <ManageModal
          game={game}
          playerId={me.id}
          playerName={me.name}
          disabled={busy}
          debt={debt ? { amount: debt.amount, to: debt.to === 'bank' ? 'el banco' : nameOf(debt.to) } : null}
          onAction={(a) => void dispatch(a)}
          onClose={() => setManageOpen(false)}
        />
      )}

      {tradeOpen && (
        <TradeModal
          game={game}
          seats={seats}
          colors={colors}
          defaultFrom={me.id}
          lockFrom
          onPropose={propose}
          onClose={() => setTradeOpen(false)}
        />
      )}
    </div>
  )
}
