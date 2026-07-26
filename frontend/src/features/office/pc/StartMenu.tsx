// Menu Iniciar: grupos à esquerda, apps do grupo em cascata à direita.
import { useState } from "react"

import { APP_GROUPS, appsOfGroup, isEnabled, type AppGroupId } from "./apps.registry"
import { usePcStore } from "./pc.store"

export function StartMenu({ onClose }: { onClose: () => void }) {
  const [hover, setHover] = useState<AppGroupId | null>(null)
  const openApp = usePcStore((s) => s.openApp)
  const shutdown = usePcStore((s) => s.shutdown)

  return (
    <div data-testid="start-menu" className="win98 win98-raised absolute bottom-full left-0 mb-0.5 flex w-44">
      <div className="w-full p-0.5">
        {APP_GROUPS.map((group) => (
          <div
            key={group.id}
            onMouseEnter={() => setHover(group.id)}
            className="relative cursor-default px-2 py-1 text-[12px] hover:bg-[var(--w98-title)] hover:text-white"
          >
            <span className="flex items-center justify-between">
              {group.label} <span aria-hidden>▸</span>
            </span>

            {hover === group.id && (
              <div className="win98-raised absolute left-full top-0 z-10 w-44 p-0.5">
                {appsOfGroup(group.id).map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    disabled={!isEnabled(app)}
                    title={isEnabled(app) ? undefined : "Em breve"}
                    onClick={() => {
                      openApp(app.id, app.size)
                      onClose()
                    }}
                    className="block w-full px-2 py-1 text-left text-[12px] enabled:hover:bg-[var(--w98-title)] enabled:hover:text-white disabled:opacity-40"
                  >
                    {app.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="my-1 h-px bg-[var(--w98-shadow)]" />
        <button
          type="button"
          onClick={() => {
            shutdown()
            onClose()
          }}
          className="block w-full px-2 py-1 text-left text-[12px] hover:bg-[var(--w98-title)] hover:text-white"
        >
          Levantar
        </button>
      </div>
    </div>
  )
}
