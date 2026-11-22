/** Iconos SVG de casa (verde, con techo a dos aguas y puerta) y hotel (rojo, torre con ventanas). */
export function HouseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="bico" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 1.5 1 9.5h2.4V18h13.2V9.5H19z" fill="#2fcf78" stroke="#06361c" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 1.5 1 9.5h18z" fill="#e8483b" stroke="#06361c" strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="8" y="12" width="4" height="6" rx="0.6" fill="#7a4a1c" stroke="#06361c" strokeWidth="0.9" />
      <rect x="4.6" y="11.4" width="2.4" height="2.4" fill="#cfefff" stroke="#06361c" strokeWidth="0.7" />
      <rect x="13" y="11.4" width="2.4" height="2.4" fill="#cfefff" stroke="#06361c" strokeWidth="0.7" />
    </svg>
  )
}

export function HotelIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="bico hotel" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="2.5" width="14" height="15.5" rx="1.2" fill="#e8483b" stroke="#4a0d08" strokeWidth="1.4" />
      <rect x="1.8" y="1.4" width="16.4" height="2.6" rx="0.8" fill="#b02a20" stroke="#4a0d08" strokeWidth="1.1" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect key={`${r}${c}`} x={5 + c * 4} y={6 + r * 3.4} width="2.4" height="2.2" fill="#ffe27a" stroke="#4a0d08" strokeWidth="0.5" />
        )),
      )}
      <rect x="8.2" y="14.6" width="3.6" height="3.4" fill="#5b2a12" stroke="#4a0d08" strokeWidth="0.7" />
    </svg>
  )
}
