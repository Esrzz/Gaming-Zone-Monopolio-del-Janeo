import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { useBoard } from '../lib/boardContext'
import type { GameState, Tile } from '../engine'
import { useView3d } from '../lib/view3d'
import { GRID_TEMPLATE, GROUP_COLORS, TOKEN_SIZE, gridCell, sideOf, tokenSlot } from '../lib/layout'
import Avatar from './Avatar'
import { HotelIcon, HouseIcon } from './BuildingIcon'
import CardReveal from './CardReveal'
import Die from './Die'
import PropertyCard from './PropertyCard'
import type { PropertyView } from './PropertyCard'

export interface Seat {
  id: string
  name: string
  avatar: string | null
  /** Color de la ficha elegido en el lobby (sin él, uno por orden de asiento) */
  color?: string
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
  /** Clic en los dados: tirar (si es el turno y toca tirar) o acelerar la animación en curso */
  onDiceClick?: () => void
  /** Qué hace un clic en los dados ahora: 'roll' = tirar, 'skip' = acelerar, null = nada */
  diceAction?: 'roll' | 'skip' | null
  /** Duración de cada paso de ficha en ms (para que la animación CSS vaya al mismo ritmo) */
  stepMs?: number
  reveal?: { deck: 'chance' | 'chest'; text: string } | null
  onCloseReveal?: () => void
  /** Clic en una casilla comprable (consultar su información) */
  onTileClick?: (pos: number) => void
  /** Tarjeta de propiedad abierta y sus acciones */
  /** Panel que se dibuja en el centro del tablero (oferta de intercambio) */
  overlay?: ReactNode
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

/** En 3D las fichas son algo más chicas: así caben de a dos por casilla lateral sin invadir la vecina. */
const TOKEN_SCALE_3D = 0.82

export default function Board({ game, seats, shown, colors, drawable = null, onDraw, rollFaces = null, onDiceClick, diceAction = null, stepMs = 130, reveal = null, onCloseReveal, onTileClick, property = null, overlay = null }: Props) {
  const board = useBoard()
  const tokens = seats.filter((s) => !game.players.find((p) => p.id === s.id)?.bankrupt)
  const perTile: Record<number, number> = {}
  for (const s of tokens) perTile[shown[s.id] ?? 0] = (perTile[shown[s.id] ?? 0] ?? 0) + 1
  const slot: Record<number, number> = {}
  const { active: view3d } = useView3d()

  return (
    <div className={`board-wrap${view3d ? ' view3d' : ''}`} style={{ ['--step-ms' as string]: `${stepMs}ms` }}>
      <div className="board-plane">
      <div className="gboard" style={{ gridTemplateColumns: GRID_TEMPLATE, gridTemplateRows: GRID_TEMPLATE }}>
        {board.map((t, i) => {
          const { row, col } = gridCell(i)
          const o = game.owned[i]
          const color = stripColor(t)
          const icon = 'icon' in t ? t.icon : null
          const info = t.kind === 'property' || t.kind === 'platform' || t.kind === 'utility'
          return (
            <div
              key={i}
              className={`tile side-${sideOf(i)} k-${t.kind}${icon ? ' has-icon' : ''}${info ? ' clickable' : ''}${o?.mortgaged ? ' mortgaged' : ''}${o && o.houses > 0 ? ' built' : ''}`}
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
              {o && o.houses > 0 && (
                <span className={`bld${o.houses === 5 ? ' hotel-band' : ''}`} aria-label={o.houses === 5 ? 'Hotel' : `${o.houses} casas`}>
                  {o.houses === 5 ? <HotelIcon size={22} /> : Array.from({ length: o.houses }, (_, k) => <HouseIcon key={k} size={16} />)}
                </span>
              )}
              {o?.mortgaged && <span className="mtag">Hipotecada</span>}
            </div>
          )
        })}

        <div className="center">
          <div className="board-art" aria-hidden="true">
            <span className="art art-tr" />
            <span className="art art-bl" />
          </div>
          <h2>Monopolio del janeo</h2>
          <div
            className={`dice${diceAction ? ' clickable' : ''}${diceAction === 'roll' ? ' ready' : ''}`}
            aria-label="Dados"
            role={diceAction ? 'button' : undefined}
            tabIndex={diceAction ? 0 : undefined}
            data-nosound
            onClick={diceAction ? onDiceClick : undefined}
            onKeyDown={diceAction ? (e) => (e.key === 'Enter' || e.key === ' ') && onDiceClick?.() : undefined}
          >
            {(rollFaces ?? game.lastDice ?? [0, 0]).map((d, i) => (
              <Die key={i} value={d} rolling={!!rollFaces} />
            ))}
          </div>
          <p className="dice-hint">{diceAction === 'roll' ? 'Tocá los dados para tirar' : diceAction === 'skip' ? 'Tocá para acelerar' : ''}</p>
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
      {tokens.map((s) => {
        const pos = shown[s.id] ?? 0
        const n = (slot[pos] = (slot[pos] ?? -1) + 1)
        const size = view3d ? TOKEN_SIZE * TOKEN_SCALE_3D : TOKEN_SIZE
        const c = tokenSlot(pos, n, perTile[pos] ?? 1, size)
        const place = { left: `${c.x}%`, top: `${c.y}%`, width: `${size}%` }
        return (
          <Fragment key={s.id}>
            {view3d && <span className="token-shadow" style={place} />}
            <span className="token" style={{ ...place, ['--c' as string]: colors[s.id] }}>
              <Avatar name={s.name} src={s.avatar} size={48} />
            </span>
          </Fragment>
        )
      })}
      </div>

      {overlay}
      {reveal && <CardReveal deck={reveal.deck} text={reveal.text} onClose={onCloseReveal} />}
      {property && !reveal && (
        // mientras hay un trueque (o su resultado) la tarjeta se esconde sin cerrarse: si no, tapa el cartel
        <div style={{ display: 'contents', visibility: overlay ? 'hidden' : 'visible' }}>
          <PropertyCard
            view={property}
            rules={game.rules}
            onBuy={property.onBuy}
            onDecline={property.onDecline}
            onPay={property.onPay}
            onClose={property.onClose}
          />
        </div>
      )}
    </div>
  )
}
