import { BOARD, isBuyable, priceOf } from '../engine'
import type { Rules, Tile } from '../engine'
import { GROUP_COLORS, tileCenter } from '../lib/layout'

export type PropertyMode = 'buy' | 'pay' | 'info'

export interface PropertyView {
  pos: number
  mode: PropertyMode
  /** Alquiler a pagar (modo 'pay') */
  amount?: number
  /** Nombre del dueño, si lo tiene */
  ownerName?: string | null
  /** Plata del jugador de turno (para deshabilitar "Comprar") */
  cash?: number
  /** Casas del dueño (para resaltar la fila vigente) */
  houses?: number
  mortgaged?: boolean
}

interface Props {
  view: PropertyView
  rules: Rules
  onBuy?: () => void
  onDecline?: () => void
  onPay?: () => void
  onClose?: () => void
}

const money = (n: number) => `$${n}`

function stripOf(t: Tile): string {
  if (t.kind === 'property') return GROUP_COLORS[t.group]
  if (t.kind === 'platform') return '#9ca3af'
  return '#cbd5e1'
}

function kicker(t: Tile): string {
  if (t.kind === 'property') return 'Propiedad'
  if (t.kind === 'platform') return 'Plataforma'
  return 'Servicio'
}

function rows(t: Tile, rules: Rules): { label: string; value: string; key?: string }[] {
  if (t.kind === 'property') {
    return [
      { label: 'Alquiler', value: money(t.rent[0]), key: '0' },
      { label: 'Con barrio completo', value: money(t.rent[0] * rules.fullSetMultiplier), key: 'set' },
      ...[1, 2, 3, 4].map((n) => ({ label: `Con ${n} casa${n > 1 ? 's' : ''}`, value: money(t.rent[n]), key: String(n) })),
      { label: 'Con hotel', value: money(t.rent[5]), key: '5' },
      { label: 'Costo de cada casa', value: money(t.houseCost) },
    ]
  }
  if (t.kind === 'platform') {
    return rules.platformRent.map((r, i) => ({ label: `Con ${i + 1} plataforma${i ? 's' : ''}`, value: money(r) }))
  }
  if (t.kind === 'utility') {
    return [
      { label: 'Con 1 servicio', value: '4 × los dados' },
      { label: 'Con los 2 servicios', value: '10 × los dados' },
    ]
  }
  return []
}

/** Tarjeta de propiedad: sale de la casilla (misma animación que las cartas) con la info y, según el caso, comprar o pagar. */
export default function PropertyCard({ view, rules, onBuy, onDecline, onPay, onClose }: Props) {
  const t = BOARD[view.pos]
  if (!isBuyable(t) || !('price' in t)) return null
  const c = tileCenter(view.pos)
  const color = stripOf(t)
  const icon = 'icon' in t ? t.icon : null
  const description = 'description' in t ? t.description : undefined
  const affordable = (view.cash ?? Infinity) >= priceOf(t)
  // En 'pay' el fondo no cierra: hay que pagar (o esperar al tiempo)
  const backdropClose = view.mode === 'pay' ? undefined : onClose

  return (
    <div
      className="cardfx pfx"
      onClick={backdropClose}
      role="dialog"
      aria-label={t.name}
      style={{ ['--fx' as string]: `${c.x - 50}cqw`, ['--fy' as string]: `${c.y - 50}cqh` }}
    >
      <div className="scene3d pscene" onClick={(e) => e.stopPropagation()}>
        <div className="pcard3d">
          <div className="face back pback" style={{ background: color }} />
          <div className="face front pfront">
            <div className="pband" style={{ background: color }}>
              <span className="pkicker">{kicker(t)}</span>
              <h3 className="pname">{t.name}</h3>
            </div>
            <div className="pbody">
              {icon && <img className="picon" src={icon} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
              <p className="pprice">
                Precio de compra <strong>{money(priceOf(t))}</strong>
              </p>
              {description && <p className="pdesc">{description}</p>}
              <ul className="prent">
                {rows(t, rules).map((r) => (
                  <li key={r.label} className={view.houses !== undefined && r.key === String(view.houses) ? 'now' : ''}>
                    <span>{r.label}</span>
                    <strong>{r.value}</strong>
                  </li>
                ))}
              </ul>
              {view.ownerName && (
                <p className="powner">
                  Dueño: <strong>{view.ownerName}</strong>
                  {view.mortgaged ? ' · hipotecada' : ''}
                </p>
              )}
            </div>

            <div className="pactions">
              {view.mode === 'buy' && (
                <>
                  <button className="btn primary" data-nosound disabled={!affordable} onClick={onBuy}>
                    Comprar por {money(priceOf(t))}
                  </button>
                  <button className="btn ghost" onClick={onDecline}>
                    No comprar
                  </button>
                  {!affordable && <p className="pnote">No te alcanza la plata.</p>}
                </>
              )}
              {view.mode === 'pay' && (
                <>
                  <button className="btn primary pay" data-nosound onClick={onPay}>
                    Pagar {money(view.amount ?? 0)}
                    {view.ownerName ? ` a ${view.ownerName}` : ''}
                  </button>
                  {view.cash !== undefined && view.cash < (view.amount ?? 0) && (
                    <p className="pnote">No te alcanza: vas a tener que juntar plata (vender casas o hipotecar).</p>
                  )}
                </>
              )}
              {view.mode === 'info' && <span className="card-skip">Tocá afuera para cerrar</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
