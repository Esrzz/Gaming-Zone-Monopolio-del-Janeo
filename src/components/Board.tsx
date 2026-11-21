import { BOARD } from '../engine'
import type { GameState, Tile } from '../engine'
import { GRID_TEMPLATE, GROUP_COLORS, gridCell, sideOf, tileCenter } from '../lib/layout'
import Avatar from './Avatar'
import CardReveal from './CardReveal'

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
  reveal?: { deck: 'chance' | 'chest'; text: string } | null
  onCloseReveal?: () => void
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

export default function Board({ game, seats, shown, colors, drawable = null, onDraw, reveal = null, onCloseReveal }: Props) {
  const tokens = seats.filter((s) => !game.players.find((p) => p.id === s.id)?.bankrupt)
  const slot: Record<number, number> = {}

  return (
    <div className="board-wrap">
      <div className="gboard" style={{ gridTemplateColumns: GRID_TEMPLATE, gridTemplateRows: GRID_TEMPLATE }}>
        {BOARD.map((t, i) => {
          const { row, col } = gridCell(i)
          const o = game.owned[i]
          const color = stripColor(t)
          const icon = 'icon' in t ? t.icon : null
          return (
            <div
              key={i}
              className={`tile side-${sideOf(i)} k-${t.kind}`}
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
            {(game.lastDice ?? [0, 0]).map((d, i) => (
              <span key={i} className="die">
                {d || '–'}
              </span>
            ))}
          </div>
          {game.rules.freeParkingJackpot && <p className="muted">Pozo: ${game.pot}</p>}

          <button
            type="button"
            className={`deck deck-chest${drawable === 'chest' ? ' ready' : ''}`}
            disabled={drawable !== 'chest'}
            onClick={onDraw}
            aria-label="Mazo de Arca comunal"
          >
            <span className="deck-icon">📦</span>
            <span className="deck-name">Arca comunal</span>
            {drawable === 'chest' && <span className="deck-hint">¡Sacá una carta!</span>}
          </button>
          <button
            type="button"
            className={`deck deck-chance${drawable === 'chance' ? ' ready' : ''}`}
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

      {tokens.map((s) => {
        const pos = shown[s.id] ?? 0
        const n = (slot[pos] = (slot[pos] ?? -1) + 1)
        const c = tileCenter(pos)
        const dx = ((n % 3) - 1) * 18
        const dy = Math.floor(n / 3) * 20 - 10
        return (
          <span
            key={s.id}
            className="token"
            style={{
              left: `${c.x}%`,
              top: `${c.y}%`,
              transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
              boxShadow: `0 0 0 3px ${colors[s.id]}, 0 4px 12px rgba(0,0,0,.5)`,
            }}
          >
            <Avatar name={s.name} src={s.avatar} size={26} />
          </span>
        )
      })}
    </div>
  )
}
