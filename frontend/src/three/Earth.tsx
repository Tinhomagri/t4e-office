import { useFrame, useLoader } from "@react-three/fiber"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"

import { damp } from "./orbit"
import { latLonToVector3, locationFromTimezone, lonToFacingRotation, type LatLon } from "./geo"
import type { PointerWorld } from "./usePointerWorld"

// ─────────────────────────────────────────────────────────────────────────────
// Terra — o planeta de verdade na tela de login.
//
// Três camadas: superfície (textura de satélite da NASA + mapa especular para o
// oceano refletir), nuvens numa esfera ligeiramente maior girando mais devagar,
// e um halo de atmosfera desenhado pelo interior de uma esfera maior (BackSide)
// com fresnel.
//
// Um marcador verde marca onde o usuário está. Ele abre na posição derivada do
// FUSO HORÁRIO — sem prompt, sem rede — e só pede GPS se o usuário clicar nele;
// aí o globo gira até a coordenada exata.
// ─────────────────────────────────────────────────────────────────────────────

export const EARTH_RADIUS = 1.75

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormalV;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ATMO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vNormalV;
  void main() {
    // Fresnel: acende na silhueta, some no miolo. Como a esfera é renderizada
    // por dentro (BackSide), isso vira um halo em volta do planeta.
    float rim = pow(1.0 - abs(vNormalV.z), 3.2);
    gl_FragColor = vec4(uColor, rim * uStrength);
  }
`

export function Earth({
  reduced,
  pointer,
  centerY,
}: {
  reduced: boolean
  pointer: PointerWorld
  centerY: number
}) {
  const group = useRef<THREE.Group>(null)
  const clouds = useRef<THREE.Mesh>(null)
  const marker = useRef<THREE.Group>(null)
  const halo = useRef<THREE.Mesh>(null)

  const [dayMap, specMap, cloudMap] = useLoader(THREE.TextureLoader, [
    "/textures/earth_atmos_2048.jpg",
    "/textures/earth_specular_2048.jpg",
    "/textures/earth_clouds_1024.png",
  ])

  // Fuso horário primeiro: o ponto já nasce no lugar aproximado certo.
  const [place, setPlace] = useState<LatLon>(() => locationFromTimezone())
  const spinTarget = useRef<number | null>(null)

  useEffect(() => {
    for (const t of [dayMap, specMap, cloudMap]) t.colorSpace = THREE.SRGBColorSpace
    specMap.colorSpace = THREE.NoColorSpace // é máscara, não cor
  }, [dayMap, specMap, cloudMap])

  const geometry = useMemo(() => new THREE.SphereGeometry(EARTH_RADIUS, 96, 64), [])
  const cloudGeometry = useMemo(() => new THREE.SphereGeometry(EARTH_RADIUS * 1.012, 64, 48), [])
  const haloGeometry = useMemo(() => new THREE.SphereGeometry(EARTH_RADIUS * 1.13, 48, 32), [])

  const surface = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        map: dayMap,
        specularMap: specMap,
        specular: new THREE.Color("#2A3A55"),
        shininess: 18,
      }),
    [dayMap, specMap],
  )

  const cloudMaterial = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        map: cloudMap,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    [cloudMap],
  )

  const haloMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: new THREE.Color("#4C9AFF") },
          uStrength: { value: 0.32 },
        },
      }),
    [],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      cloudGeometry.dispose()
      haloGeometry.dispose()
      surface.dispose()
      cloudMaterial.dispose()
      haloMaterial.dispose()
    },
    [geometry, cloudGeometry, haloGeometry, surface, cloudMaterial, haloMaterial],
  )

  const markerPos = useMemo(
    () => latLonToVector3(place.lat, place.lon, EARTH_RADIUS * 1.045),
    [place],
  )

  // O GPS só é pedido quando o usuário clica no marcador — permissão como
  // consequência de curiosidade, não como pedágio da tela de login.
  const askPreciseLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPlace({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          label: "Você está aqui",
          precise: true,
        })
        spinTarget.current = lonToFacingRotation(p.coords.longitude)
      },
      // Negou ou falhou: fica no palpite do fuso, sem mensagem de erro.
      () => undefined,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    )
  }, [])

  useFrame((state, delta) => {
    const g = group.current
    if (!g || reduced) return
    const dt = Math.min(delta, 0.05)

    if (spinTarget.current === null) {
      g.rotation.y += dt * 0.055 // rotação lenta, como um planeta
    } else {
      // Gira até deixar a coordenada do usuário de frente e para lá.
      g.rotation.y = damp(g.rotation.y, spinTarget.current, 2.2, dt)
      if (Math.abs(g.rotation.y - spinTarget.current) < 0.002) spinTarget.current = null
    }

    // Inclinação seguindo o cursor, amortecida.
    const targetX = -pointer.ndc.current.y * 0.28
    g.rotation.x += (targetX - g.rotation.x) * 0.05
    g.position.y = centerY + Math.sin(state.clock.elapsedTime * 0.4) * 0.05

    // Nuvens correm um pouco mais que o solo.
    if (clouds.current) clouds.current.rotation.y += dt * 0.018

    // Marcador: pulsa e sempre encara a câmera.
    if (marker.current) {
      const p = 1 + Math.sin(state.clock.elapsedTime * 2.4) * 0.18
      marker.current.scale.setScalar(p)
      marker.current.quaternion.copy(state.camera.quaternion)
    }
    if (halo.current) {
      const m = halo.current.material as THREE.ShaderMaterial
      m.uniforms.uStrength.value = 0.3 + Math.sin(state.clock.elapsedTime * 0.7) * 0.04
    }
  })

  return (
    <group ref={group} position={[0, centerY, 0]} rotation={[0, 0, 0.41]}>
      <mesh geometry={geometry} material={surface} />
      <mesh ref={clouds} geometry={cloudGeometry} material={cloudMaterial} />
      <mesh ref={halo} geometry={haloGeometry} material={haloMaterial} />

      {/* Marcador da localização: disco verde + halo, virado para a câmera. */}
      <group ref={marker} position={[markerPos.x, markerPos.y, markerPos.z]}>
        <mesh
          onClick={askPreciseLocation}
          onPointerOver={() => (document.body.style.cursor = "pointer")}
          onPointerOut={() => (document.body.style.cursor = "")}
        >
          <circleGeometry args={[0.03, 24]} />
          <meshBasicMaterial color="#39E27E" toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.001]}>
          <ringGeometry args={[0.042, 0.095, 32]} />
          <meshBasicMaterial color="#39E27E" transparent opacity={0.28} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}
