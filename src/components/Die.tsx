/** Casillas (1-9, de izquierda a derecha y de arriba abajo) donde va un punto para cada valor. */
const PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
}

interface Props {
  value: number
  rolling?: boolean
}

/** Dado con puntos como uno de verdad (0 = todavía sin tirar: cara en blanco). */
export default function Die({ value, rolling = false }: Props) {
  const on = PIPS[value] ?? []
  return (
    <span className={`die${rolling ? ' rolling' : ''}`} role="img" aria-label={value ? `Dado: ${value}` : 'Dado'}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`pip${on.includes(i + 1) ? ' on' : ''}${value === 1 ? ' one' : ''}`} />
      ))}
    </span>
  )
}
