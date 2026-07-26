// Barra de tarefas: Iniciar, janelas abertas, relógio e o botão de levantar.
import { useEffect, useState } from "react"

import { appById } from "./apps.registry"
import { usePcStore } from "./pc.store"
import { StartMenu } from "./StartMenu"

function agora(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function Taskbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [clock, setClock] = useState(agora)

  const windows = usePcStore((s) => s.windows)
  const focusedId = usePcStore((s) => s.focusedId)
  const focus = usePcStore((s) => s.focus)
  const minimize = usePcStore((s) => s.minimize)
  const shutdown = usePcStore((s) => s.shutdown)

  useEffect(() => {
    const t = window.setInterval(() => setClock(agora()), 20_000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <div className="win98 win98-raised relative flex items-center gap-1 p-0.5">
      <button
        type="button"
        aria-label="Iniciar"
        onClick={() => setMenuOpen((v) => !v)}
        className="win98-raised px-2 py-0.5 text-[11px] font-bold"
      >
        Iniciar
      </button>
      {menuOpen && <StartMenu onClose={() => setMenuOpen(false)} />}

      <div className="mx-1 h-5 w-px bg-[var(--w98-shadow)]" />

      <div className="flex flex-1 items-center gap-1 overflow-hidden">
        {windows.map((w) => {
          const app = appById(w.appId)
          const ativa = focusedId === w.id && !w.minimized
          return (
            <button
              key={w.id}
              type="button"
              aria-label={app?.label ?? w.appId}
              onClick={() => (ativa ? minimize(w.id) : focus(w.id))}
              className={`max-w-40 truncate px-2 py-0.5 text-[11px] ${
                ativa ? "win98-sunken" : "win98-raised"
              }`}
            >
              {app?.label ?? w.appId}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        aria-label="Levantar"
        onClick={shutdown}
        className="win98-raised px-2 py-0.5 text-[11px]"
      >
        Levantar
      </button>
      <span data-testid="win98-clock" className="win98-sunken px-2 py-0.5 text-[11px]">
        {clock}
      </span>
    </div>
  )
}
