import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useMemo, useRef } from "react"
import * as THREE from "three"

// ─────────────────────────────────────────────────────────────────────────────
// Túnel de wireframe — cena WebGL real (three.js/R3F), 100% monocromática (P&B).
// Corredor infinito de molduras brancas avançando devagar sobre o preto da marca,
// névoa nas bordas (profundidade) e parallax sutil reagindo ao mouse. Nada de cor:
// só luz, linha e distância. Substitui o antigo canvas 2D por profundidade real.
//
// Performance: ~48 draw calls (um lineSegments por moldura), geometria e material
// compartilhados, zero alocação no loop de render. Alvo 60fps em GPU média.
// Acessibilidade: com prefers-reduced-motion o túnel congela (mantém a profundidade
// estática, sem movimento) — respeitando motion-principles.
// ─────────────────────────────────────────────────────────────────────────────

const INK = "#181A1F" // fundo/névoa (token `ink`)
const RING_COUNT = 48
const SPACING = 1.6 // distância no eixo Z entre molduras
const SPEED = 2.2 // unidades/seg que o túnel avança em direção à câmera
const DEPTH = RING_COUNT * SPACING

// Uma moldura quadrada em wireframe (só as 4 arestas → 4 draw segments).
const frameGeometry = () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(3, 3))

function Tunnel({ reduced }: { reduced: boolean }) {
  const group = useRef<THREE.Group>(null)
  const rings = useRef<THREE.LineSegments[]>([])
  const geo = useMemo(frameGeometry, [])
  const { pointer } = useThree()

  // Posições iniciais escalonadas ao longo de -Z, com leve rotação crescente
  // para dar a sensação de torção do corredor.
  const initial = useMemo(
    () =>
      Array.from({ length: RING_COUNT }, (_, i) => ({
        z: -i * SPACING,
        rot: i * 0.06,
      })),
    [],
  )

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05) // clamp: evita salto após aba inativa
    for (let i = 0; i < rings.current.length; i++) {
      const ring = rings.current[i]
      if (!ring) continue
      if (!reduced) {
        ring.position.z += SPEED * d
        ring.rotation.z += d * 0.04
        // Recicla a moldura para o fundo do túnel quando passa da câmera.
        if (ring.position.z > 3) ring.position.z -= DEPTH
      }
      // Brilho pela distância: molduras próximas mais fortes, longe apagam na névoa.
      const mat = ring.material as THREE.LineBasicMaterial
      const t = 1 - Math.min(Math.abs(ring.position.z + 8) / 20, 1)
      mat.opacity = 0.12 + t * 0.5
    }
    // Parallax do corredor inteiro seguindo o mouse (amortecido).
    if (group.current && !reduced) {
      group.current.rotation.y += (pointer.x * 0.18 - group.current.rotation.y) * 0.05
      group.current.rotation.x += (-pointer.y * 0.12 - group.current.rotation.x) * 0.05
    }
  })

  return (
    <group ref={group}>
      {initial.map((r, i) => (
        <lineSegments
          key={i}
          ref={(el) => {
            if (el) rings.current[i] = el
          }}
          geometry={geo}
          position={[0, 0, r.z]}
          rotation={[0, 0, r.rot]}
        >
          <lineBasicMaterial color="#ffffff" transparent opacity={0.3} />
        </lineSegments>
      ))}
    </group>
  )
}

export function LoginScene() {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 60 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      {/* Névoa: apaga as molduras distantes no tom do fundo → profundidade real */}
      <fog attach="fog" args={[INK, 6, 26]} />
      <Tunnel reduced={reduced} />
    </Canvas>
  )
}
