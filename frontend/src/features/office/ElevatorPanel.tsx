// Painel do elevador — a única UI que sabe que o prédio tem andares.
//
// Estética Win98 reaproveitando as classes de pc/win98.css. O desktop já
// importa esse CSS, mas o painel pode ser montado sem o desktop (ex.: nos
// testes), então importamos aqui também, do mesmo jeito que o Win98Window.
// Andar sem planta aparece travado: é assim que o andar 2 vai destravar
// depois, sem mexer aqui.
import { useWorldStore } from "./world.store"
import { floorButtons } from "./world/elevator"
import { FLOORS } from "./world/floors"
import "./pc/win98.css"

export function ElevatorPanel() {
  const open = useWorldStore((s) => s.panelOpen)
  const floor = useWorldStore((s) => s.floor)
  const close = useWorldStore((s) => s.closePanel)
  const goToFloor = useWorldStore((s) => s.goToFloor)

  if (!open) return null

  const buttons = floorButtons(FLOORS, floor)

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/50">
      <div className="win98 win98-raised w-[280px]">
        <div className="win98-titlebar win98-titlebar--active flex items-center gap-1 px-1 py-0.5">
          <span className="flex-1 truncate text-[11px]">Elevador</span>
          <button type="button" className="win98-btn" onClick={close} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="win98-sunken m-0.5 flex flex-col gap-1 p-3">
          {buttons.map((b) => (
            <button
              key={b.n}
              type="button"
              className="win98-btn flex items-center justify-between px-2 py-1 text-left"
              disabled={b.locked || b.current}
              aria-label={`Andar ${b.n} — ${b.label}`}
              onClick={() => goToFloor(b.n)}
            >
              <span>
                <b>{b.n}</b> · {b.label}
              </span>
              <span className="text-[11px] opacity-70">
                {b.current ? "você está aqui" : b.locked ? "em obras" : "ir"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
