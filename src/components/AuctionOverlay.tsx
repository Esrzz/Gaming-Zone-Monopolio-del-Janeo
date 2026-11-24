import { useState } from 'react'
import { useBoard } from '../lib/boardContext'
import { priceOf, type Auction, type PlayerState } from '../engine'
import { tileDot } from '../lib/tileColor'

interface Props {
  auction: Auction
  players: PlayerState[]
  nameOf: (id: string) => string
  secondsLeft: number
  /** Online: el jugador que mira (null = modo de prueba, donde se elige quién ofrece) */
  you: string | null
  busy: boolean
  onBid: (player: string, amount: number) => void
  onPass: (player: string) => void
}

const INCREMENTS = [10, 50, 100]

/** Subasta en el centro del tablero: la ven todos y cualquiera puede ofrecer o retirarse. */
export default function AuctionOverlay({ auction, players, nameOf, secondsLeft, you, busy, onBid, onPass }: Props) {
  const board = useBoard()
  const tile = board[auction.tile]
  const alive = players.filter((p) => !p.bankrupt)
  const [devWho, setDevWho] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  const who = you ?? devWho ?? alive.find((p) => !auction.passed.includes(p.id) && p.id !== auction.leader)?.id ?? alive[0]?.id
  const me = players.find((p) => p.id === who)
  const out = !me || me.bankrupt || auction.passed.includes(me.id)
  const leading = !!me && auction.leader === me.id
  const list = 'price' in tile ? priceOf(tile) : 0
  const customN = Math.floor(Number(custom))
  const canCustom = !!me && Number.isFinite(customN) && customN > auction.bid && customN <= me.cash

  return (
    <div className="tradefx" role="dialog" aria-label="Subasta">
      <div className="trade-pop auction">
        <h3>
          🔨 Subasta: {tile.name}
          <span className={`timer${secondsLeft <= 5 ? ' urgent' : ''}`}>⏱ {secondsLeft}s</span>
        </h3>
        <p className="auc-bid">
          {auction.leader ? (
            <>
              <strong>${auction.bid}</strong> · {nameOf(auction.leader)}
            </>
          ) : (
            <span className="muted">Sin ofertas todavía</span>
          )}
          {list > 0 && <small> · precio de lista ${list}</small>}
        </p>

        <ul className="auc-players">
          {alive.map((p) => (
            <li key={p.id} className={auction.passed.includes(p.id) ? 'out' : p.id === auction.leader ? 'lead' : ''}>
              <i className="pdotc" style={{ background: tileDot(auction.tile) }} />
              {p.name} <em>${p.cash}</em>
              {auction.passed.includes(p.id) && <small> · se retiró</small>}
              {p.id === auction.leader && <small> · va ganando</small>}
            </li>
          ))}
        </ul>

        {you === null && (
          <label className="auc-who">
            Ofrece
            <select className="input sm" value={who} onChange={(e) => setDevWho(e.target.value)}>
              {alive.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {me && !out && !leading && (
          <>
            <div className="auc-btns">
              {INCREMENTS.map((inc) => (
                <button key={inc} className="btn primary" disabled={busy || auction.bid + inc > me.cash} onClick={() => onBid(me.id, auction.bid + inc)}>
                  +${inc}
                </button>
              ))}
            </div>
            <form
              className="auc-custom"
              onSubmit={(e) => {
                e.preventDefault()
                if (canCustom && !busy) {
                  onBid(me.id, customN)
                  setCustom('')
                }
              }}
            >
              <input className="input sm" type="number" inputMode="numeric" placeholder={`Más de $${auction.bid}`} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Tu oferta" />
              <button className="btn ghost sm" type="submit" disabled={busy || !canCustom}>
                Ofrecer
              </button>
              <button className="btn ghost sm" type="button" disabled={busy} onClick={() => onPass(me.id)}>
                Retirarme
              </button>
            </form>
          </>
        )}
        {me && leading && <p className="muted">Tenés la oferta más alta. Si nadie ofrece más, es tuya.</p>}
        {me && !leading && out && <p className="muted">{auction.passed.includes(me.id) ? 'Te retiraste de la subasta.' : 'Mirando la subasta.'}</p>}
        {you !== null && !me && <p className="muted">Mirando la subasta.</p>}
      </div>
    </div>
  )
}
