// Grade de ícones do desktop: quatro pastas por área, cada uma com seus apps.
//
// Duas telas em vez de 20 ícones soltos — desktop cheio fica ilegível e o
// agrupamento por área é o mesmo que a sidebar já usa.
import { Folder } from "lucide-react"

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
    const apps = appsOfGroup(group.id)
    return (
      <div className="win98 win98-raised absolute left-3 top-3 z-10 w-[380px] p-0.5">
        <div className="win98-titlebar win98-titlebar--active flex items-center px-1 py-0.5">
          <span className="flex-1 text-[11px]">{group.label}</span>
          <button type="button" className="win98-btn" aria-label="Fechar pasta"
            onClick={() => openFolder(null)}>✕</button>
        </div>
        {/* Área de conteúdo afundada e branca: o mesmo contraste de uma janela
            de pasta real. Sobre o cinza da moldura, rótulo de app era ilegível. */}
        <div className="win98-sunken m-0.5 grid grid-cols-4 gap-1 bg-white p-2">
          {apps.map((app) => (
            <IconButton
              key={app.id}
              label={app.label}
              disabled={!isEnabled(app)}
              onOpen={() => openApp(app.id, app.size)}
              icon={<app.icon className="size-8" strokeWidth={1.5} />}
              tone="dark"
            />
          ))}
        </div>
        <p className="px-2 pb-1 pt-0.5 text-[10px] text-[var(--w98-shadow)]">
          {apps.length} {apps.length === 1 ? "item" : "itens"} · duplo clique para abrir
        </p>
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
          icon={<Folder className="size-8" strokeWidth={1.5} />}
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
  tone = "light",
}: {
  label: string
  icon: React.ReactNode
  onOpen: () => void
  disabled?: boolean
  /** "light" = sobre o papel de parede; "dark" = dentro da pasta (fundo branco). */
  tone?: "light" | "dark"
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? "Em breve" : `Abrir ${label}`}
      onDoubleClick={onOpen}
      // Enter/Espaço abrem também: navegar por teclado não deve depender de
      // conseguir emitir um duplo clique.
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`win98 flex flex-col items-center gap-1 rounded-none p-1 text-center text-[11px] leading-tight ${
        tone === "dark"
          ? "text-[var(--w98-dark)] hover:bg-[var(--w98-title)] hover:text-white"
          : "text-white hover:bg-white/15"
      } ${disabled ? "opacity-40" : ""} focus-visible:outline focus-visible:outline-1 focus-visible:outline-dotted`}
    >
      {icon}
      <span
        className={tone === "light" ? "drop-shadow-[1px_1px_0_rgba(0,0,0,0.8)]" : undefined}
      >
        {label}
      </span>
    </button>
  )
}
