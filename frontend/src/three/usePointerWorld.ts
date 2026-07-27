import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useRef } from "react"

// Ponteiro compartilhado pela cena de login (partículas + nave).
//
// Não usamos o `pointer` do R3F por dois motivos:
//  1. ele começa em (0,0) — o centro exato do glifo —, o que abriria a cena com
//     uma explosão fantasma e com a nave já assustada;
//  2. o bloco de branding sobrepõe o canvas; escutando na janela e projetando
//     pelo rect, o cursor continua valendo mesmo por cima do texto.
export interface PointerWorld {
  live: React.MutableRefObject<boolean>
  /** Coordenadas normalizadas (-1..1) dentro do canvas. */
  ndc: React.MutableRefObject<{ x: number; y: number }>
  /** Mesmo ponto projetado no plano z=0 do mundo. */
  world: React.MutableRefObject<{ x: number; y: number }>
}

export function usePointerWorld(): PointerWorld {
  const live = useRef(false)
  const ndc = useRef({ x: 0, y: 0 })
  const world = useRef({ x: 0, y: 0 })
  const { gl, viewport } = useThree()

  useEffect(() => {
    const el = gl.domElement
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      live.current = inside
      if (!inside) return
      ndc.current.x = ((e.clientX - r.left) / r.width) * 2 - 1
      ndc.current.y = -(((e.clientY - r.top) / r.height) * 2 - 1)
    }
    const onLeave = () => (live.current = false)
    window.addEventListener("pointermove", onMove, { passive: true })
    document.addEventListener("pointerleave", onLeave)
    return () => {
      window.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerleave", onLeave)
    }
  }, [gl])

  // Projeção feita uma vez por frame, num só lugar: os consumidores só leem.
  useFrame(() => {
    world.current.x = (ndc.current.x * viewport.width) / 2
    world.current.y = (ndc.current.y * viewport.height) / 2
  })

  return { live, ndc, world }
}
