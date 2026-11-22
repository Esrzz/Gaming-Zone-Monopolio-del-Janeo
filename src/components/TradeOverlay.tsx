import { BOARD } from '../engine'
import type { TradeOffer, TradeSide } from '../engine'
import { tileDot } from '../lib/tileColor'

export type TradeRole = 'to' | 'from' | 'watch' | 'dev'

interface Props {
  trade: TradeOffer
  nameOf: (id: string) => string
  /** Segundos que le quedan a quien recibe la oferta */
  secondsLeft: number
  /** Qué botones ve cada uno: quien recibe responde, quien ofrece puede retirar, el resto mira */
  role: TradeRole
  busy: boolean
  onAccept: () => void
  onReject: () => void
  onCancel: () => void
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function Side({ side }: { side: TradeSide }) {
  const empty = side.cash <= 0 && side.properties.length === 0 && side.jailCards <= 0
  return (
    <ul className="tside">
      {side.cash > 0 && <li className="tcash">💰 ${side.cash}</li>}
      {side.properties.map((p) => (
        <li key={p}>
          <i className="pdotc" style={{ background: tileDot(p) }} />
          {BOARD[p].name}
        </li>
      ))}
      {side.jailCards > 0 && <li>🎟️ {side.jailCards === 1 ? 'Carta de salida' : `${side.jailCards} cartas de salida`}</li>}
      {empty && <li className="muted">Nada</li>}
    </ul>
  )
}

/** Oferta de intercambio en el centro del tablero: la ven todos, la responde solo quien la recibe. */
export default function TradeOverlay({ trade, nameOf, secondsLeft, role, busy, onAccept, onReject, onCancel }: Props) {
  return (
    <div className="tradefx" role="dialog" aria-label="Oferta de intercambio">
      <div className="trade-pop">
        <h3>
          🤝 Oferta de intercambio
          <span className={`timer${secondsLeft <= 10 ? ' urgent' : ''}`}>⏱ {fmt(secondsLeft)}</span>
        </h3>
        <div className="trade-cols">
          <section>
            <h4>{nameOf(trade.from)} ofrece</h4>
            <Side side={trade.give} />
          </section>
          <span className="trade-arrows" aria-hidden="true">⇄</span>
          <section>
            <h4>{nameOf(trade.from)} pide a {nameOf(trade.to)}</h4>
            <Side side={trade.get} />
          </section>
        </div>
        {(role === 'to' || role === 'dev') && (
          <div className="trade-btns">
            <button className="btn primary" disabled={busy} onClick={onAccept}>
              {role === 'dev' ? `${nameOf(trade.to)} acepta` : 'Aceptar'}
            </button>
            <button className="btn ghost" disabled={busy} onClick={onReject}>
              Rechazar
            </button>
          </div>
        )}
        {(role === 'from' || role === 'dev') && (
          <button className="link" disabled={busy} onClick={onCancel}>
            Retirar oferta
          </button>
        )}
        {role === 'watch' && <p className="muted">Esperando la respuesta de {nameOf(trade.to)}…</p>}
        {role === 'from' && <p className="muted">Esperando la respuesta de {nameOf(trade.to)}…</p>}
      </div>
    </div>
  )
}
