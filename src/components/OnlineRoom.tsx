import { useEffect, useMemo, useRef, useState } from 'react'
import { whyCannotStart } from '../engine'
import type { Action, ClockView, Room, Rules, ServerMessage } from '../engine'
import { RoomClient, lastRoom } from '../lib/net'
import type { NetStatus } from '../lib/net'
import type { NetUpdate, OnlineLink } from '../lib/onlineLink'
import Avatar from './Avatar'
import DevGame from './DevGame'
import type { Seat } from './Board'

interface Props {
  code: string
  create: boolean
  name: string
  avatar: string | null
  onExit: () => void
  onSettings: () => void
  /** Avisa si hace falta la pantalla ancha (la partida) o la angosta (el lobby) */
  onLayout: (wide: boolean) => void
}

interface ChatLine {
  from: string
  text: string
  at: number
}

/** Sala online: lobby (listos, reglas, chat) y, al empezar, la partida conectada al servidor. */
export default function OnlineRoom({ code, create, name, avatar, onExit, onSettings: _onSettings, onLayout }: Props) {
  const [status, setStatus] = useState<NetStatus>('connecting')
  const [room, setRoom] = useState<Room | null>(null)
  const [you, setYou] = useState<string | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [chat, setChat] = useState<ChatLine[]>([])
  const client = useRef<RoomClient | null>(null)
  const listeners = useRef(new Set<(u: NetUpdate) => void>())
  const emit = (u: NetUpdate) => listeners.current.forEach((l) => l(u))

  useEffect(() => {
    let dead = false
    const c = new RoomClient({
      code,
      create,
      name,
      avatar,
      onStatus: (s) => !dead && setStatus(s),
      onFatal: (e) => {
        if (dead) return
        lastRoom.clear()
        setFatal(e)
      },
      onMessage: (m: ServerMessage) => {
        if (dead) return
        if (m.t === 'room') {
          lastRoom.set(code)
          setRoom(m.room)
          setYou(m.you)
          emit({ kind: 'clock', clock: m.clock as ClockView | null })
          if (m.room.game) emit({ kind: 'sync', state: m.room.game })
        } else if (m.t === 'update') {
          setRoom(m.room)
          emit({ kind: 'clock', clock: m.clock })
          if (m.room.game) emit({ kind: 'update', state: m.room.game, events: m.events, seq: m.seq, auto: !!m.auto })
        } else if (m.t === 'ui') {
          emit({ kind: 'ui', ui: m.kind, seq: m.seq })
        } else if (m.t === 'chat') {
          setChat((l) => [...l.slice(-99), { from: m.from, text: m.text, at: m.at }])
        } else if (m.t === 'error') {
          setNotice(m.error)
          emit({ kind: 'error', error: m.error })
        }
      },
    })
    client.current = c
    return () => {
      dead = true
      c.stop()
    }
    // la conexión se abre una sola vez por sala
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const playing = room?.status === 'playing' || room?.status === 'finished'
  useEffect(() => {
    onLayout(!!playing)
    return () => onLayout(false)
  }, [playing, onLayout])

  const leave = () => {
    client.current?.send({ t: 'leave' })
    client.current?.stop()
    lastRoom.clear()
    onExit()
  }

  const seats: Seat[] = useMemo(() => {
    if (!room?.game) return []
    return room.game.players.map((p) => ({ id: p.id, name: p.name, avatar: room.members.find((m) => m.id === p.id)?.avatar ?? null }))
    // los asientos no cambian durante la partida
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, room?.game?.players.length])

  const link: OnlineLink | null =
    room?.game && you
      ? {
          you,
          initial: room.game,
          send: (a: Action) => client.current?.send({ t: 'action', action: a }) ?? false,
          sendUi: (ui, seq) => void client.current?.send({ t: 'ui', kind: ui, seq }),
          subscribe: (l) => {
            listeners.current.add(l)
            return () => listeners.current.delete(l)
          },
          offline: room.members.filter((m) => !m.connected).map((m) => m.id),
          status,
          sidebar: <ChatPanel lines={chat} onSend={(text) => client.current?.send({ t: 'chat', text })} />,
        }
      : null

  if (fatal) {
    return (
      <div className="card">
        <h2>No se pudo entrar</h2>
        <p className="err">{fatal}</p>
        <button className="btn primary" onClick={onExit}>
          Volver
        </button>
      </div>
    )
  }

  if (!room || !you) {
    return (
      <div className="card">
        <h2>Sala {code}</h2>
        <p className="muted">{status === 'reconnecting' ? 'Reconectando…' : 'Conectando con el servidor…'}</p>
        <button className="link" onClick={leave}>
          Cancelar
        </button>
      </div>
    )
  }

  if (link && seats.length > 0) {
    return <DevGame key={room.code} seats={seats} online={link} onExit={leave} onSettings={_onSettings} />
  }

  const me = room.members.find((m) => m.id === you)
  const isHost = room.hostId === you
  const why = whyCannotStart(room)
  const send = (m: Parameters<RoomClient['send']>[0]) => {
    setNotice(null)
    client.current?.send(m)
  }

  return (
    <div className="lobby-wrap">
      <div className="card lobby">
        <div className="lobby-code">
          <span className="muted">Código de la sala</span>
          <button
            className="code-big"
            title="Copiar código"
            onClick={() => void navigator.clipboard?.writeText(room.code)}
          >
            {room.code}
          </button>
          <span className="hint">Compartilo para que se unan (hasta 6 jugadores)</span>
        </div>

        <ul className="mlist">
          {room.members.map((m) => (
            <li key={m.id} className={m.connected ? '' : 'off'}>
              <Avatar name={m.name} src={m.avatar} size={32} />
              <span className="mname">
                {m.name}
                {m.id === room.hostId && <em> · host 👑</em>}
                {m.id === you && <em> · vos</em>}
              </span>
              <span className={`mstate ${m.ready ? 'ok' : ''}`}>{!m.connected ? 'sin conexión' : m.ready ? '✓ listo' : 'esperando'}</span>
            </li>
          ))}
        </ul>

        <RulesForm rules={room.rules} editable={isHost} onChange={(rules) => send({ t: 'rules', rules })} />

        {notice && <p className="err">{notice}</p>}
        {status === 'reconnecting' && <p className="muted">Reconectando con el servidor…</p>}

        <div className="stack">
          <button className="btn ghost" onClick={() => send({ t: 'ready', ready: !me?.ready })}>
            {me?.ready ? 'Ya no estoy listo' : 'Estoy listo'}
          </button>
          {isHost && (
            <>
              <button className="btn primary" disabled={!!why} onClick={() => send({ t: 'start' })}>
                Empezar partida
              </button>
              {why && <p className="hint">{why}</p>}
            </>
          )}
          <button className="link" onClick={leave}>
            Salir de la sala
          </button>
        </div>
      </div>
      <ChatPanel lines={chat} onSend={(text) => client.current?.send({ t: 'chat', text })} />
    </div>
  )
}

const RULE_FIELDS: { key: 'startingCash' | 'goSalary' | 'jailFine' | 'maxJailTurns'; label: string }[] = [
  { key: 'startingCash', label: 'Plata inicial' },
  { key: 'goSalary', label: 'Cobro al pasar por la salida' },
  { key: 'jailFine', label: 'Multa de la cárcel' },
  { key: 'maxJailTurns', label: 'Turnos en la cárcel' },
]

/** Reglas de la partida: solo el host las cambia (el servidor las valida y las corrige si hace falta). */
function RulesForm({ rules, editable, onChange }: { rules: Rules; editable: boolean; onChange: (r: Record<string, unknown>) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({})
  const commit = (key: string) => {
    const raw = draft[key]
    if (raw === undefined) return
    setDraft((d) => {
      const { [key]: _gone, ...rest } = d
      return rest
    })
    const n = Number(raw)
    if (Number.isFinite(n) && n !== (rules as unknown as Record<string, number>)[key]) onChange({ [key]: n })
  }
  return (
    <details className="rules" open={editable}>
      <summary>Reglas {editable ? '(las cambiás vos)' : ''}</summary>
      <div className="rules-grid">
        {RULE_FIELDS.map((f) => (
          <label key={f.key} className="rule">
            <span>{f.label}</span>
            <input
              className="input sm"
              type="number"
              disabled={!editable}
              value={draft[f.key] ?? String(rules[f.key])}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              onBlur={() => commit(f.key)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
        ))}
        <label className="check">
          <input type="checkbox" disabled={!editable} checked={rules.freeParkingJackpot} onChange={(e) => onChange({ freeParkingJackpot: e.target.checked })} />
          Impuestos al pozo del Estacionamiento
        </label>
      </div>
    </details>
  )
}

/** Chat de la sala (el servidor limpia y limita los mensajes). */
function ChatPanel({ lines, onSend }: { lines: ChatLine[]; onSend: (text: string) => void }) {
  const [text, setText] = useState('')
  const box = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])
  return (
    <section className="panel-card chat">
      <h3>Chat</h3>
      <ul className="chat-lines" ref={box}>
        {lines.length === 0 && <li className="muted">Todavía no hay mensajes</li>}
        {lines.map((l, i) => (
          <li key={i}>
            <b>{l.from}</b> {l.text}
          </li>
        ))}
      </ul>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          onSend(text)
          setText('')
        }}
      >
        <input className="input sm" value={text} maxLength={280} placeholder="Escribí un mensaje…" onChange={(e) => setText(e.target.value)} aria-label="Mensaje" />
        <button className="btn ghost sm" type="submit" disabled={!text.trim()}>
          Enviar
        </button>
      </form>
    </section>
  )
}
