// Janela do desktop 98: moldura, arrastar, redimensionar, _ □ X.
//
// Posiciona por left/top/width/height, nunca por transform: transform num
// ancestral vira containing block e faria os modais (position: fixed) das
// páginas embutidas se posicionarem dentro da janela em vez da viewport.
import { useEffect, useRef, type ReactNode } from "react"

import { usePcStore, type PcWindow } from "./pc.store"

export function Win98Window({
  win,
  title,
  fullscreen = false,
  children,
}: {
  win: PcWindow
  title: string
  /** Ocupa a camada inteira (usado pela janela expandida). */
  fullscreen?: boolean
  children: ReactNode
}) {
  const focusedId = usePcStore((s) => s.focusedId)
  const expandedId = usePcStore((s) => s.expandedId)
  const move = usePcStore((s) => s.move)
  const resizeWindow = usePcStore((s) => s.resizeWindow)
  const focus = usePcStore((s) => s.focus)
  const minimize = usePcStore((s) => s.minimize)
  const expand = usePcStore((s) => s.expand)
  const collapse = usePcStore((s) => s.collapse)
  const close = usePcStore((s) => s.close)

  const active = focusedId === win.id
  const expanded = expandedId === win.id
  const origin = useRef({ px: 0, py: 0, x: 0, y: 0, w: 0, h: 0 })

  // Os listeners ficam no window, não no elemento: arraste rápido sai de cima da
  // titlebar e não pode perder o rastro. Guardar o teardown num ref é o que
  // permite desligá-los se a janela fechar no meio do arraste.
  const stopTracking = useRef<(() => void) | null>(null)
  useEffect(() => () => stopTracking.current?.(), [])

  const track = (e: React.PointerEvent, onMove: (ev: PointerEvent) => void) => {
    focus(win.id)
    origin.current = { px: e.clientX, py: e.clientY, x: win.x, y: win.y, w: win.w, h: win.h }
    stopTracking.current?.()
    const up = () => stopTracking.current?.()
    stopTracking.current = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", up)
      stopTracking.current = null
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", up)
  }

  const startDrag = (e: React.PointerEvent) => {
    track(e, (ev) => {
      const o = origin.current
      move(win.id, o.x + (ev.clientX - o.px), o.y + (ev.clientY - o.py))
    })
  }

  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation()
    track(e, (ev) => {
      const o = origin.current
      resizeWindow(win.id, o.w + (ev.clientX - o.px), o.h + (ev.clientY - o.py))
    })
  }

  if (win.minimized) return null

  return (
    <div
      className="win98 win98-raised absolute flex flex-col"
      style={
        fullscreen
          ? { inset: 0, zIndex: win.z }
          : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }
      }
      onPointerDown={() => focus(win.id)}
    >
      <div
        data-testid="win98-titlebar"
        className={`win98-titlebar flex items-center gap-1 px-1 py-0.5 ${active ? "win98-titlebar--active" : ""}`}
        onPointerDown={fullscreen ? undefined : startDrag}
        onDoubleClick={() => (expanded ? collapse() : expand(win.id))}
      >
        <span className="flex-1 truncate text-[11px]">{title}</span>
        <button type="button" className="win98-btn" aria-label="Minimizar"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => minimize(win.id)}>_</button>
        <button type="button" className="win98-btn" aria-label="Maximizar"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => (expanded ? collapse() : expand(win.id))}>□</button>
        <button type="button" className="win98-btn" aria-label="Fechar"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => close(win.id)}>✕</button>
      </div>

      {/* O conteúdo rola dentro da janela; a página embutida não sabe que está numa. */}
      <div className="win98-sunken m-0.5 flex-1 overflow-auto bg-white">{children}</div>

      {/* Expandida ocupa a camada toda: não há o que redimensionar. */}
      {!fullscreen && (
        <div
          data-testid="win98-resize"
          className="win98-resize self-end"
          onPointerDown={startResize}
        />
      )}
    </div>
  )
}
