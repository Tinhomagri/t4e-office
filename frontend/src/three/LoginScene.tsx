import { Canvas } from "@react-three/fiber"
import { Suspense } from "react"

import { CatShip } from "./CatShip"
import { Earth } from "./Earth"
import { SaturnRing } from "./SaturnRing"
import { usePointerWorld } from "./usePointerWorld"

// ─────────────────────────────────────────────────────────────────────────────
// Cena WebGL da tela de login: a Terra girando com o marcador da sua
// localização, um anel de Saturno e uma naveta tripulada por um gatinho
// correndo dentro do anel.
//
// Ver Earth.tsx (planeta + nuvens + atmosfera + marcador), SaturnRing.tsx
// (a pista) e CatShip.tsx (a nave).
// ─────────────────────────────────────────────────────────────────────────────

/** Centro da cena, deslocado para cima: a base do painel é da headline. */
const CENTER_Y = 0.25

function SceneContents({ reduced }: { reduced: boolean }) {
  // Um só lugar lê o ponteiro e projeta no mundo; globo e nave consomem o mesmo
  // estado. Precisa viver DENTRO do Canvas para ter contexto R3F.
  const pointer = usePointerWorld()
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 5, 4]} intensity={1.15} />
      <group position={[0, CENTER_Y, 0]}>
        <SaturnRing reduced={reduced} />
      </group>
      {/* Suspense DENTRO do Canvas: o TextureLoader lança promessa. */}
      <Suspense fallback={null}>
        <Earth reduced={reduced} pointer={pointer} centerY={CENTER_Y} />
      </Suspense>
      <CatShip reduced={reduced} pointer={pointer} centerY={CENTER_Y} />
    </>
  )
}

export function LoginScene() {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  return (
    <Canvas
      camera={{ position: [0, 0, 9], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <SceneContents reduced={reduced} />
    </Canvas>
  )
}
