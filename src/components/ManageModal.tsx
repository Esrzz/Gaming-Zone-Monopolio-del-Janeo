import {
  BOARD,
  HOTEL,
  buildingsInUse,
  mortgageValue,
  sellValue,
  unmortgageCost,
  whyNotBuild,
  whyNotMortgage,
  whyNotSell,
  whyNotUnmortgage,
} from '../engine'
import type { Action, GameState, Tile } from '../engine'
import { GROUP_COLORS } from '../lib/layout'

interface Props {
  game: GameState
  playerId: string
  playerName: string
  /** Mientras hay animaciones en curso no se puede actuar */
  disabled: boolean
  onAction: (a: Action) => void
  onClose: () => void
}

const money = (n: number) => `$${n}`

function colorOf(t: Tile): string {
  if (t.kind === 'property') return GROUP_COLORS[t.group]
  return t.kind === 'platform' ? '#9ca3af' : '#cbd5e1'
}

/** Orden de la lista: por posición en el tablero, agrupando por barrio. */
function groupKey(t: Tile): string {
  return t.kind === 'property' ? t.group : t.kind
}

function Buildings({ houses }: { houses: number }) {
  if (houses === HOTEL) return <span className="mg-built hotel" title="Hotel">🏨</span>
  if (houses === 0) return null
  return (
    <span className="mg-built" title={`${houses} casa${houses > 1 ? 's' : ''}`}>
      {'🏠'.repeat(houses)}
    </span>
  )
}

/** Gestionar propiedades: construir, vender casas e hipotecar (como en el Monopoly original). */
export default function ManageModal({ game, playerId, playerName, disabled, onAction, onClose }: Props) {
  const me = game.players.find((p) => p.id === playerId)!
  const mine = Object.entries(game.owned)
    .filter(([, o]) => o.owner === playerId)
    .map(([pos]) => Number(pos))
    .sort((a, b) => a - b)
  const used = buildingsInUse(game)
  const groups = new Map<string, number[]>()
  for (const pos of mine) {
    const k = groupKey(BOARD[pos])
    groups.set(k, [...(groups.get(k) ?? []), pos])
  }

  const act = (type: 'build' | 'sellHouse' | 'mortgage' | 'unmortgage', tile: number) => onAction({ type, player: playerId, tile })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Gestionar propiedades">
        <div className="modal-header">
          <h2>Gestionar · {playerName}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="mg-summary">
            <span>
              Plata <strong>{money(me.cash)}</strong>
            </span>
            <span title="Casas y hoteles que quedan en el banco">
              🏠 {game.rules.housesTotal - used.houses} · 🏨 {game.rules.hotelsTotal - used.hotels} en el banco
            </span>
          </div>

          {mine.length === 0 && <p className="muted">Todavía no tenés propiedades.</p>}

          <div className="mg-list">
            {[...groups.values()].map((positions) => (
              <section key={positions[0]} className="mg-group">
                {positions.map((pos) => {
                  const t = BOARD[pos]
                  const o = game.owned[pos]
                  const isStreet = t.kind === 'property'
                  const build = isStreet ? whyNotBuild(game, playerId, pos) : 'Solo en propiedades de color'
                  const sell = isStreet ? whyNotSell(game, playerId, pos) : 'No tiene casas'
                  const mort = whyNotMortgage(game, playerId, pos)
                  const unmort = whyNotUnmortgage(game, playerId, pos)
                  const buildCost = t.kind === 'property' ? t.houseCost : 0
                  return (
                    <div key={pos} className={`mg-row${o.mortgaged ? ' mortgaged' : ''}`}>
                      <span className="mg-dot" style={{ background: colorOf(t) }} />
                      <span className="mg-name">
                        {t.name}
                        {o.mortgaged && <em> · hipotecada</em>}
                      </span>
                      <Buildings houses={o.houses} />
                      <span className="mg-actions">
                        {isStreet && (
                          <>
                            <button className="btn ghost sm" disabled={disabled || !!build} title={build ?? `Construir ${o.houses === HOTEL - 1 ? 'un hotel' : 'una casa'}`} onClick={() => act('build', pos)}>
                              {o.houses === HOTEL - 1 ? 'Hotel' : 'Construir'} −{money(buildCost)}
                            </button>
                            <button className="btn ghost sm" disabled={disabled || !!sell} title={sell ?? 'Vender'} onClick={() => act('sellHouse', pos)}>
                              Vender +{money(sellValue(pos))}
                            </button>
                          </>
                        )}
                        {o.mortgaged ? (
                          <button className="btn ghost sm" disabled={disabled || !!unmort} title={unmort ?? 'Levantar la hipoteca'} onClick={() => act('unmortgage', pos)}>
                            Levantar −{money(unmortgageCost(pos))}
                          </button>
                        ) : (
                          <button className="btn ghost sm" disabled={disabled || !!mort} title={mort ?? 'Hipotecar'} onClick={() => act('mortgage', pos)}>
                            Hipotecar +{money(mortgageValue(pos))}
                          </button>
                        )}
                      </span>
                    </div>
                  )
                })}
              </section>
            ))}
          </div>
          <p className="muted mg-note">
            Construí parejo dentro del barrio completo. Para hipotecar hay que vender antes las casas del barrio. Levantar una hipoteca cuesta el valor más 10%.
          </p>
        </div>
      </div>
    </div>
  )
}
