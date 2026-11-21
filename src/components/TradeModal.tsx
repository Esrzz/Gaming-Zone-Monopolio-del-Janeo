import { useMemo, useState } from 'react'
import { BOARD, isTradable, validateTrade } from '../engine'
import type { GameState, TradeOffer, TradeSide } from '../engine'
import { GROUP_COLORS } from '../lib/layout'
import type { Seat } from './Board'

interface Props {
  game: GameState
  seats: Seat[]
  colors: Record<string, string>
  /** Quién propone por defecto (normalmente el jugador de turno) */
  defaultFrom: string
  onPropose: (offer: TradeOffer) => void
  onClose: () => void
}

const toSide = (cash: string, props: number[], jailCards: number): TradeSide => ({
  cash: Math.max(0, Math.floor(Number(cash) || 0)),
  properties: props,
  jailCards,
})

export default function TradeModal({ game, seats, colors, defaultFrom, onPropose, onClose }: Props) {
  const alive = game.players.filter((p) => !p.bankrupt)
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(alive.find((p) => p.id !== defaultFrom)?.id ?? '')
  const [giveCash, setGiveCash] = useState('')
  const [getCash, setGetCash] = useState('')
  const [giveProps, setGiveProps] = useState<number[]>([])
  const [getProps, setGetProps] = useState<number[]>([])
  const [giveJail, setGiveJail] = useState(0)
  const [getJail, setGetJail] = useState(0)

  const nameOf = (id: string) => seats.find((s) => s.id === id)?.name ?? id
  const playerOf = (id: string) => game.players.find((p) => p.id === id)

  const offer: TradeOffer = useMemo(
    () => ({ from, to, give: toSide(giveCash, giveProps, giveJail), get: toSide(getCash, getProps, getJail) }),
    [from, to, giveCash, getCash, giveProps, getProps, giveJail, getJail],
  )
  const error = to ? validateTrade(game, offer) : 'Elegí con quién intercambiar'

  const reset = () => {
    setGiveProps([])
    setGetProps([])
    setGiveCash('')
    setGetCash('')
    setGiveJail(0)
    setGetJail(0)
  }
  const changeFrom = (id: string) => {
    setFrom(id)
    if (id === to) setTo(alive.find((p) => p.id !== id)?.id ?? '')
    reset()
  }
  const changeTo = (id: string) => {
    setTo(id)
    setGetProps([])
    setGetCash('')
    setGetJail(0)
  }

  const toggle = (list: number[], set: (v: number[]) => void, pos: number) =>
    set(list.includes(pos) ? list.filter((p) => p !== pos) : [...list, pos])

  const column = (
    owner: string,
    title: string,
    cash: string,
    setCash: (v: string) => void,
    props: number[],
    setProps: (v: number[]) => void,
    jail: number,
    setJail: (v: number) => void,
  ) => {
    const p = playerOf(owner)
    const owned = Object.entries(game.owned)
      .filter(([, o]) => o.owner === owner)
      .map(([pos]) => Number(pos))
      .sort((a, b) => a - b)
    return (
      <section className="trade-col" style={{ borderColor: colors[owner] }}>
        <h3>{title}</h3>
        <label className="trade-field">
          Plata (tiene ${p?.cash ?? 0})
          <input
            className="input sm"
            type="number"
            min={0}
            value={cash}
            placeholder="0"
            onChange={(e) => setCash(e.target.value)}
          />
        </label>
        {(p?.jailCards ?? 0) > 0 && (
          <label className="trade-field">
            Cartas de salida (tiene {p?.jailCards})
            <input
              className="input sm"
              type="number"
              min={0}
              max={p?.jailCards}
              value={jail}
              onChange={(e) => setJail(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            />
          </label>
        )}
        <div className="trade-props">
          {owned.length === 0 && <p className="muted">Sin propiedades</p>}
          {owned.map((pos) => {
            const t = BOARD[pos]
            const ok = isTradable(game, pos)
            const color = t.kind === 'property' ? GROUP_COLORS[t.group] : t.kind === 'platform' ? '#9ca3af' : '#cbd5e1'
            const mortgaged = game.owned[pos].mortgaged
            return (
              <label key={pos} className={`trade-prop${ok ? '' : ' off'}`} title={ok ? '' : 'Tiene casas en su grupo: hay que venderlas antes'}>
                <input type="checkbox" disabled={!ok} checked={props.includes(pos)} onChange={() => toggle(props, setProps, pos)} />
                <span className="trade-dot" style={{ background: color }} />
                <span className="trade-name">{t.name}</span>
                {mortgaged && <em>hipotecada</em>}
              </label>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Intercambio">
        <div className="modal-header">
          <h2>Intercambio</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="trade-who">
            <label className="trade-field">
              Ofrece
              <select className="input sm" value={from} onChange={(e) => changeFrom(e.target.value)}>
                {alive.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="trade-arrow" aria-hidden="true">
              ⇄
            </span>
            <label className="trade-field">
              Con
              <select className="input sm" value={to} onChange={(e) => changeTo(e.target.value)}>
                {alive
                  .filter((p) => p.id !== from)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <div className="trade-cols">
            {column(from, `${nameOf(from)} da`, giveCash, setGiveCash, giveProps, setGiveProps, giveJail, setGiveJail)}
            {to && column(to, `${nameOf(to)} da`, getCash, setGetCash, getProps, setGetProps, getJail, setGetJail)}
          </div>

          {error && <p className="err">{error}</p>}
          <div className="row2">
            <button className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" disabled={!!error} onClick={() => onPropose(offer)}>
              Proponer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
