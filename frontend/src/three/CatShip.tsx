import { useFrame } from "@react-three/fiber"
import { useMemo, useRef, type MutableRefObject } from "react"
import * as THREE from "three"

import { damp, orbitBank, orbitHeading, orbitPosition, ORBIT } from "./orbit"

// ─────────────────────────────────────────────────────────────────────────────
// Naveta com gatinho — orbita o glifo de partículas do login.
//
// Tudo é geometria primitiva (cápsula, esfera, cone) num único grupo: ~10 meshes,
// materiais compartilhados, zero asset externo para carregar. A órbita é 3D de
// verdade, então a nave some atrás do "T4" e reaparece maior na frente — quem
// resolve a oclusão é o depth buffer, já que as partículas não escrevem profundidade.
//
// O gatinho vira a cabeça para acompanhar o cursor e a nave recua se o ponteiro
// chegar perto demais. O rabo segue tudo com atraso de mola.
// ─────────────────────────────────────────────────────────────────────────────

const HULL = "#DCE3ED"
const HULL_DARK = "#5E6E86"
const GLASS = "#BBD8FF"
const CAT = "#F2E8DC"
const CAT_DARK = "#C9B9A6"
const THRUST = "#4C9AFF"

/** Tamanho geral da nave. */
const BASE_SCALE = 0.85

/** Distância (unidades de mundo) em que a nave começa a se afastar do cursor. */
const SHY_RADIUS = 2.2

export interface PointerState {
  live: MutableRefObject<boolean>
  /** Posição do cursor no mesmo espaço da órbita. */
  world: MutableRefObject<{ x: number; y: number }>
}

export function CatShip({
  reduced,
  pointer,
  centerY,
}: {
  reduced: boolean
  pointer: PointerState
  centerY: number
}) {
  const ship = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const flame = useRef<THREE.Mesh>(null)

  // Estado do voo mantido em ref: mexer nisso via setState re-renderizaria a
  // árvore 60x por segundo.
  const shy = useRef(0)
  /** Segundos de avanço acumulados na órbita por causa dos sustos. */
  const boost = useRef(0)
  const headYaw = useRef(0)
  const tailSwing = useRef(0)
  const pos = useMemo(() => ({ x: 0, y: 0, z: 0 }), [])

  const materials = useMemo(() => {
    const make = (color: string, extra?: THREE.MeshLambertMaterialParameters) =>
      new THREE.MeshLambertMaterial({ color, ...extra })
    return {
      hull: make(HULL),
      hullDark: make(HULL_DARK),
      glass: new THREE.MeshBasicMaterial({
        color: GLASS,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      cat: make(CAT),
      catDark: make(CAT_DARK),
      eye: new THREE.MeshBasicMaterial({ color: "#1B1E24" }),
      thrust: new THREE.MeshBasicMaterial({ color: THRUST, transparent: true, opacity: 0.85 }),
    }
  }, [])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05)
    const g = ship.current
    if (!g) return

    // Susto: em vez de empurrar a nave para fora (o que a tirava do plano do
    // anel), ele ACELERA a nave ao longo do próprio trilho. Ela apressa o passo
    // para fugir do cursor e nunca sai da pista.
    const baseT = reduced ? ORBIT.period * 0.12 : state.clock.elapsedTime
    orbitPosition(baseT + boost.current, ORBIT, pos)

    if (pointer.live.current && !reduced) {
      const dx = pos.x - pointer.world.current.x
      const dy = pos.y + centerY - pointer.world.current.y
      const d = Math.hypot(dx, dy)
      shy.current = damp(shy.current, Math.max(0, 1 - d / SHY_RADIUS), 6, dt)
    } else {
      shy.current = damp(shy.current, 0, 4, dt)
    }
    // O avanço extra é acumulado (nunca volta atrás): recuar no tempo faria a
    // nave andar de ré quando o cursor se afastasse.
    boost.current += shy.current * dt * 2.4

    const t = baseT + boost.current
    g.position.set(pos.x, centerY + pos.y, pos.z)
    g.rotation.y = orbitHeading(t) - Math.PI / 2
    g.rotation.z = reduced ? 0 : orbitBank(t)
    // Susto também encolhe um pouquinho a nave — leitura instantânea de "opa!".
    g.scale.setScalar(BASE_SCALE * (1 - shy.current * 0.12))

    if (reduced) return

    // Cabeça acompanha o cursor quando ele está por perto; senão volta ao centro.
    if (head.current) {
      // -π/2 - yawDaNave é o ângulo que aponta a carinha para a câmera.
      const faceCamera = -Math.PI / 2 - g.rotation.y
      const look = pointer.live.current ? (pointer.world.current.x - pos.x) * 0.12 : 0
      const targetYaw = Math.max(-1, Math.min(1, faceCamera + look))
      headYaw.current = damp(headYaw.current, targetYaw, 5, dt)
      head.current.rotation.y = headYaw.current
      head.current.position.y = 0.30 + Math.sin(state.clock.elapsedTime * 2.2) * 0.012
    }

    // Rabo: segue a inclinação da nave com atraso, e balança sozinho.
    if (tail.current) {
      const target = -g.rotation.z * 1.6 + Math.sin(state.clock.elapsedTime * 3.1) * 0.35
      tailSwing.current = damp(tailSwing.current, target, 7, dt)
      tail.current.rotation.z = tailSwing.current
    }

    // Propulsor pulsando — a única coisa que "acelera" na cena.
    if (flame.current) {
      const p = 0.75 + Math.sin(state.clock.elapsedTime * 14) * 0.25
      flame.current.scale.set(1, p, 1)
      ;(flame.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + p * 0.35
    }
  })

  return (
    <group ref={ship}>
      {/* Casco: cápsula deitada apontando para +X (o sentido do voo). */}
      <mesh material={materials.hull} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.2, 0.72, 6, 14]} />
      </mesh>

      {/* Asinhas laterais, uma de cada lado do casco */}
      <mesh material={materials.hullDark} position={[-0.2, -0.07, -0.24]} rotation={[-0.5, 0, -0.1]}>
        <boxGeometry args={[0.26, 0.03, 0.26]} />
      </mesh>
      <mesh material={materials.hullDark} position={[-0.2, -0.07, 0.24]} rotation={[0.5, 0, -0.1]}>
        <boxGeometry args={[0.26, 0.03, 0.26]} />
      </mesh>

      {/* Para-brisa baixo na frente da cabine, no lugar de um domo fechado. */}
      <mesh material={materials.glass} position={[0.3, 0.2, 0]} rotation={[0, 0, -0.5]}>
        <sphereGeometry args={[0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
      </mesh>

      {/* Gatinho */}
      <group ref={head} position={[0.06, 0.3, 0]}>
        <mesh material={materials.cat}>
          <sphereGeometry args={[0.2, 16, 12]} />
        </mesh>
        {/* Orelhas */}
        <mesh material={materials.catDark} position={[-0.02, 0.17, -0.1]} rotation={[0.2, 0, 0.25]}>
          <coneGeometry args={[0.075, 0.15, 4]} />
        </mesh>
        <mesh material={materials.catDark} position={[-0.02, 0.17, 0.1]} rotation={[-0.2, 0, 0.25]}>
          <coneGeometry args={[0.075, 0.15, 4]} />
        </mesh>
        {/* Olhos */}
        <mesh material={materials.eye} position={[0.165, 0.03, -0.075]}>
          <sphereGeometry args={[0.035, 8, 6]} />
        </mesh>
        <mesh material={materials.eye} position={[0.165, 0.03, 0.075]}>
          <sphereGeometry args={[0.035, 8, 6]} />
        </mesh>
        {/* Focinho */}
        <mesh material={materials.catDark} position={[0.195, -0.035, 0]}>
          <sphereGeometry args={[0.038, 8, 6]} />
        </mesh>
      </group>

      {/* Rabo saindo por trás do assento */}
      <group ref={tail} position={[-0.3, 0.12, 0]}>
        <mesh material={materials.cat} position={[-0.12, 0.06, 0]} rotation={[0, 0, 0.9]}>
          <capsuleGeometry args={[0.032, 0.24, 4, 8]} />
        </mesh>
      </group>

      {/* Propulsor: bocal + chama */}
      <mesh material={materials.hullDark} position={[-0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.11, 0.14, 0.14, 12]} />
      </mesh>
      <mesh
        ref={flame}
        material={materials.thrust}
        position={[-0.58, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <coneGeometry args={[0.1, 0.34, 12]} />
      </mesh>
    </group>
  )
}
