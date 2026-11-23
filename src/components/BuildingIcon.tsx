/** Iconos SVG: casa (cuerpo verde, techo rojo con brillo, chimenea y puerta) y hotel (torre roja con ventanas encendidas y cartel). */
export function HouseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="bico" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect x="13.2" y="2.2" width="2.6" height="5" fill="#8a3a2a" stroke="#06361c" strokeWidth="1" />
      <path d="M3.6 9.2h12.8V18H3.6z" fill="#3ee08a" stroke="#06361c" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 1.4 0.9 9.6h18.2z" fill="#ff5a48" stroke="#06361c" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 3.4 4.2 8.6h5.8z" fill="#ff9a8c" opacity="0.8" />
      <rect x="8.2" y="12.2" width="3.6" height="5.8" rx="0.6" fill="#8a5424" stroke="#06361c" strokeWidth="0.9" />
      <rect x="4.8" y="11.6" width="2.4" height="2.4" fill="#d9f4ff" stroke="#06361c" strokeWidth="0.8" />
      <rect x="12.8" y="11.6" width="2.4" height="2.4" fill="#d9f4ff" stroke="#06361c" strokeWidth="0.8" />
    </svg>
  )
}

export function HotelIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="bico hotel" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 .6v3.2" stroke="#4a0d08" strokeWidth="1" />
      <path d="M10 .8h4.2l-1 1.2 1 1.2H10z" fill="#ffd23f" stroke="#4a0d08" strokeWidth="0.6" />
      <rect x="3" y="3.6" width="14" height="14.4" rx="1.2" fill="#ff4a3a" stroke="#4a0d08" strokeWidth="1.5" />
      <rect x="1.6" y="3.4" width="16.8" height="2.8" rx="0.8" fill="#b02a20" stroke="#4a0d08" strokeWidth="1.2" />
      <rect x="3.6" y="6.6" width="2.4" height="11" fill="#ff8c7e" opacity="0.5" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect key={`${r}${c}`} x={5.2 + c * 3.8} y={7.2 + r * 3.2} width="2.4" height="2" fill="#ffe27a" stroke="#4a0d08" strokeWidth="0.5" />
        )),
      )}
      <rect x="8" y="14.8" width="4" height="3.2" fill="#5b2a12" stroke="#4a0d08" strokeWidth="0.7" />
    </svg>
  )
}
