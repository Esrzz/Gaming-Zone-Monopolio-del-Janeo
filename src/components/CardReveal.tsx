interface Props {
  deck: 'chance' | 'chest'
  text: string
  onClose?: () => void
}

/** Carta que sale del mazo, se da vuelta y muestra su texto. Se cierra con un clic. */
export default function CardReveal({ deck, text, onClose }: Props) {
  const title = deck === 'chance' ? 'Suerte' : 'Arcas del discord'
  return (
    <div className="cardfx" onClick={onClose} role="dialog" aria-label={`Carta de ${title}`}>
      <div className="scene3d">
        <div className={`card3d from-${deck}`}>
          <div className={`face back ${deck}`}>
            <span className="back-icon">{deck === 'chance' ? '❓' : '📦'}</span>
          </div>
          <div className={`face front ${deck}`}>
            <span className="card-kicker">{title}</span>
            <p className="card-body">{text}</p>
            <span className="card-skip">Tocá para continuar</span>
          </div>
        </div>
      </div>
    </div>
  )
}
