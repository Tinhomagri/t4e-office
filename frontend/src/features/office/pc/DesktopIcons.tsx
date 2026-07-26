// Grade de ícones do desktop: quatro pastas por área, cada uma com seus apps.
//
// Duas telas em vez de 15 ícones soltos — desktop cheio fica ilegível e o
// agrupamento por área é o mesmo que a sidebar já usa.
import { Folder, MonitorPlay } from "lucide-react"

import { APP_GROUPS, appsOfGroup, isEnabled } from "./apps.registry"
import { usePcStore } from "./pc.store"

export function DesktopIcons() {
  const openFolderId = usePcStore((s) => s.openFolderId)
  const openFolder = usePcStore((s) => s.openFolder)
  const openApp = usePcStore((s) => s.openApp)

  if (openFolderId) {
    const group = APP_GROUPS.find((g) => g.id === openFolderId)
    // Sem o grupo (id inválido) não há como montar a grade de apps: melhor
    // não renderizar a pasta do que arriscar um cast para o tipo errado.
    if (!group) return null
    return (
      <div className="win98 win98-raised absolute left-3 top-3 w-64 p-1">
        <div className="win98-titlebar win98-titlebar--active mb-2 flex items-center px-1 py-0.5">
          <span className="flex-1 text-[11px]">{group.label}</span>
          <button type="button" className="win98-btn" aria-label="Fechar pasta"
            onClick={() => openFolder(null)}>✕</button>
        </div>
        <div className="grid grid-cols-3 gap-1 p-1">
          {appsOfGroup(group.id).map((app) => (
            <IconButton
              key={app.id}
              label={app.label}
              disabled={!isEnabled(app)}
              onOpen={() => openApp(app.id, app.size)}
              icon={<MonitorPlay className="size-7" />}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="grid w-24 gap-3 p-3">
      {APP_GROUPS.map((group) => (
        <IconButton
          key={group.id}
          label={group.label}
          onOpen={() => openFolder(group.id)}
          icon={<Folder className="size-8" />}
        />
      ))}
    </div>
  )
}

function IconButton({
  label,
  icon,
  onOpen,
  disabled = false,
}: {
  label: string
  icon: React.ReactNode
  onOpen: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? "Em breve" : undefined}
      onDoubleClick={onOpen}
      className={`win98 flex flex-col items-center gap-0.5 p-1 text-center text-[11px] text-white ${
        disabled ? "opacity-40" : "hover:bg-white/15"
      }`}
    >
      {icon}
      <span className="leading-tight drop-shadow-[1px_1px_0_rgba(0,0,0,0.8)]">{label}</span>
    </button>
  )
}
