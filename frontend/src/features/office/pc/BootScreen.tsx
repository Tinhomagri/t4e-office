// Boot do 98: POST curto e logo. Serve de cortina — é atrás dele que a escala
// da câmera troca, então o salto de zoom não aparece.
import { useEffect } from "react"
import { useReducedMotion } from "framer-motion"

export const BOOT_MS = 700

export function BootScreen({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion()

  useEffect(() => {
    const t = window.setTimeout(onDone, reduce ? 0 : BOOT_MS)
    return () => window.clearTimeout(t)
  }, [onDone, reduce])

  return (
    <div
      data-testid="boot-screen"
      className="win98 absolute inset-0 grid place-items-center bg-black font-mono text-[13px] text-[#c0c0c0]"
    >
      <div className="space-y-1">
        <p>T4E Office BIOS v1.98</p>
        <p>Memória OK — Avatar OK — Presença OK</p>
        <p className="text-white">Iniciando T4E Office 98...</p>
      </div>
    </div>
  )
}
