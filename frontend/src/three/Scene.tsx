import { Float } from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useMemo, useRef } from "react"
import * as THREE from "three"

// Núcleo: globo geodésico em wireframe branco. Duas cascas contra-rotativas
// dão profundidade. Sem material metálico — evita o "brilho" especular disforme.
function Core() {
  const outer = useRef<THREE.Mesh>(null)
  const inner = useRef<THREE.Mesh>(null)
  const group = useRef<THREE.Group>(null)

  useFrame((state, delta) => {
    if (outer.current) outer.current.rotation.y += delta * 0.12
    if (inner.current) {
      inner.current.rotation.y -= delta * 0.18
      inner.current.rotation.x += delta * 0.06
    }
    if (group.current) {
      // Respiração sutil
      const s = 1 + Math.sin(state.clock.elapsedTime * 0.6) * 0.03
      group.current.scale.setScalar(s)
    }
  })

  return (
    <group ref={group}>
      {/* Casca externa: geodésica densa, fios finos */}
      <mesh ref={outer}>
        <icosahedronGeometry args={[2, 4]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.16} />
      </mesh>
      {/* Casca interna: triangulação maior, mais marcada */}
      <mesh ref={inner} scale={0.78}>
        <icosahedronGeometry args={[2, 1]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.28} />
      </mesh>
    </group>
  )
}

// Campo de partículas: poeira estelar com sprite RADIAL (pontos redondos, não quadrados).
function Dust({ count = 1200 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null)

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 4 + Math.random() * 8
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [count])

  // Textura circular gerada em canvas -> partícula vira ponto suave, não quadrado
  const sprite = useMemo(() => {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 64
    const ctx = canvas.getContext("2d")!
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, "rgba(255,255,255,1)")
    grad.addColorStop(0.4, "rgba(255,255,255,0.6)")
    grad.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(canvas)
  }, [])

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.015
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        map={sprite}
        color="#ffffff"
        transparent
        opacity={0.7}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  )
}

// Parallax: câmera segue o ponteiro suavemente, dando sensação 3D.
function PointerParallax() {
  const { camera, pointer } = useThree()
  useFrame(() => {
    camera.position.x += (pointer.x * 0.7 - camera.position.x) * 0.04
    camera.position.y += (pointer.y * 0.7 - camera.position.y) * 0.04
    camera.lookAt(0, 0, 0)
  })
  return null
}

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.6} />
      <Float speed={1.2} rotationIntensity={0.4} floatIntensity={0.6}>
        <Core />
      </Float>
      <Dust />
      <PointerParallax />
    </Canvas>
  )
}
