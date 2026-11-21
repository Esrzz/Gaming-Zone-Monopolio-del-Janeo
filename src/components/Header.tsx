import Avatar from './Avatar'

interface Props {
  name: string
  avatar: string | null
  canDev: boolean
  devMode: boolean
  onToggleDev: (on: boolean) => void
  onSettings: () => void
}

export default function Header({ name, avatar, canDev, devMode, onToggleDev, onSettings }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span>Gaming Zone</span> · Monopolio del janeo
      </div>
      <div className="topbar-right">
        {canDev && (
          <label className="switch">
            <span>Modo developer</span>
            <input
              type="checkbox"
              role="switch"
              checked={devMode}
              onChange={(e) => onToggleDev(e.target.checked)}
            />
            <i aria-hidden="true" />
          </label>
        )}
        <button className="topbar-settings" onClick={onSettings} aria-label="Configuraciones">
          ⚙
        </button>
        <div className="topbar-user">
          <Avatar name={name} src={avatar} size={32} />
          <strong>{name}</strong>
        </div>
      </div>
    </header>
  )
}
