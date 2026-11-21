import { BOARD } from '../engine'
import type { GameState, Tile } from '../engine'
import { GRID_TEMPLATE, GROUP_COLORS, TOKEN_SIZE, gridCell, sideOf, tokenSlot } from '../lib/layout'
import Avatar from './Avatar'
import CardReveal from './CardReveal'
import PropertyCard from './PropertyCard'
import type { PropertyView } from './PropertyCard'

export interface Seat {
  id: string
  name: string
  avatar: string | null
}

interface Props {
  game: GameState
  seats: Seat[]
  /** Posición que se está mostrando de cada ficha (puede ir detrás del estado mientras se anima) */
  shown: Record<string, number>
  colors: Record<string, string>
  /** Mazo que el jugador de turno tiene que robar ahora (se resalta y se puede clickear) */
  drawable?: 'chance' | 'chest' | null
  onDraw?: () => void
  /** Carta que se está mostrando (animación de robo) */
  /** Números al azar que se muestran en los dados mientras suena la tirada */
  rollFaces?: [number, number] | null
  reveal?: { deck: 'chance' | 'chest'; text: string } | null
  onCloseReveal?: () => void
  /** Clic en una casilla comprable (consultar su información) */
  onTileClick?: (pos: number) => void
  /** Tarjeta de propiedad abierta y sus acciones */
  property?: (PropertyView & { onBuy?: () => void; onDecline?: () => void; onPay?: () => void; onClose?: () => void }) | null
}

function stripColor(t: Tile): string | null {
  if (t.kind === 'property') return GROUP_COLORS[t.group]
  if (t.kind === 'platform') return '#9ca3af'
  if (t.kind === 'utility') return '#cbd5e1'
  return null
}

function label(t: Tile): string {
  switch (t.kind) {
    case 'tax':
      return `$${t.amount}`
    case 'property':
    case 'platform':
    case 'utility':
      return `$${t.price}`
    default:
      return ''
  }
}

export default function Board({ game, seats, shown, colors, drawable = null, onDraw, rollFaces = null, reveal = null, onCloseReveal, onTileClick, property = null }: Props) {
  const tokens = seats.filter((s) => !game.players.find((p) => p.id === s.id)?.bankrupt)
  const perTile: Record<number, number> = {}
  for (const s of tokens) perTile[shown[s.id] ?? 0] = (perTile[shown[s.id] ?? 0] ?? 0) + 1
  const slot: Record<number, number> = {}

  return (
    <div className="board-wrap">
      <div className="gboard" style={{ gridTemplateColumns: GRID_TEMPLATE, gridTemplateRows: GRID_TEMPLATE }}>
        {BOARD.map((t, i) => {
          const { row, col } = gridCell(i)
          const o = game.owned[i]
          const color = stripColor(t)
          const icon = 'icon' in t ? t.icon : null
          const info = t.kind === 'property' || t.kind === 'platform' || t.kind === 'utility'
          return (
            <div
              key={i}
              className={`tile side-${sideOf(i)} k-${t.kind}${info ? ' clickable' : ''}`}
              onClick={info && onTileClick ? () => onTileClick(i) : undefined}
              style={{
                gridRow: row,
                gridColumn: col,
                boxShadow: o ? `inset 0 0 0 3px ${colors[o.owner]}` : undefined,
              }}
              title={t.name}
            >
              {color && <span className="strip" style={{ background: color }} />}
              {icon && <img className="ticon" src={icon} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />}
              <span className="tname">{t.name}</span>
              <span className="tprice">{label(t)}</span>
              {o && o.houses > 0 && <span className="houses">{o.houses === 5 ? 'H' : o.houses}</span>}
            </div>
          )
        })}

        <div className="center">
          <h2>Monopolio del janeo</h2>
          <div className="dice" aria-label="Dados">
            {(rollFaces ?? game.lastDice ?? [0, 0]).map((d, i) => (
              <span key={i} className={`die${rollFaces ? ' rolling' : ''}`}>
                {d || '–'}
              </span>
            ))}
          </div>
          {game.rules.freeParkingJackpot && <p className="muted">Pozo: ${game.pot}</p>}

          <button
            type="button"
            data-nosound className={`deck deck-chest${drawable === 'chest' ? ' ready' : ''}`}
            disabled={drawable !== 'chest'}
            onClick={onDraw}
            aria-label="Mazo de Arcas del discord"
          >
            <span className="deck-icon">📦</span>
            <span className="deck-name">Arcas del discord</span>
            {drawable === 'chest' && <span className="deck-hint">¡Sacá una carta!</span>}
          </button>
          <button
            type="button"
            data-nosound className={`deck deck-chance${drawable === 'chance' ? ' ready' : ''}`}
            disabled={drawable !== 'chance'}
            onClick={onDraw}
            aria-label="Mazo de Suerte"
          >
            <span className="deck-icon">❓</span>
            <span className="deck-name">Suerte</span>
            {drawable === 'chance' && <span className="deck-hint">¡Sacá una carta!</span>}
          </button>
        </div>
      </div>

      {reveal && <CardReveal deck={reveal.deck} text={reveal.text} onClose={onCloseReveal} />}
      {property && !reveal && (
        <PropertyCard
          view={property}
          rules={game.rules}
          onBuy={property.onBuy}
          onDecline={property.onDecline}
          onPay={property.onPay}
          onClose={property.onClose}
        />
      )}

      {tokens.map((s) => {
        const pos = shown[s.id] ?? 0
        const n = (slot[pos] = (slot[pos] ?? -1) + 1)
        const c = tokenSlot(pos, n, perTile[pos] ?? 1)
        return (
          <span
            key={s.id}
            className="token"
            style={{
              left: `${c.x}%`,
              top: `${c.y}%`,
              width: `${TOKEN_SIZE}%`,
              height: `${TOKEN_SIZE}%`,
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 0 3px ${colors[s.id]}, 0 4px 12px rgba(0,0,0,.5)`,
            }}
          >
            <Avatar name={s.name} src={s.avatar} size={40} />
          </span>
        )
      })}
    </div>
  )
}
