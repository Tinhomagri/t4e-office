import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"

import { ORBIT, RING_INNER, RING_OUTER } from "./orbit"

// ─────────────────────────────────────────────────────────────────────────────
// Anel de Saturno — a pista da nave.
//
// Não é decoração solta: o anel é desenhado no MESMO plano inclinado em que a
// órbita da nave é calculada (`ORBIT.tilt`), e o raio da órbita cai no meio da
// faixa. Por isso o gatinho parece correr sobre o trilho em vez de perto dele.
//
// As bandas e a granulação vêm do shader — um anel de partículas de verdade
// custaria milhares de pontos para o mesmo resultado a esta distância.
// ─────────────────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
  varying vec2 vXY;
  void main() {
    // RingGeometry vive no plano XY local; guardamos a posição para o fragment
    // derivar raio e ângulo.
    vXY = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  uniform float uInner;
  uniform float uOuter;
  uniform vec3 uColor;
  uniform vec3 uWarm;
  uniform float uOpacity;
  uniform float uTime;

  varying vec2 vXY;

  // Hash barato para granular a poeira sem textura.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    float r = length(vXY);
    float t = (r - uInner) / (uOuter - uInner);
    if (t < 0.0 || t > 1.0) discard;

    float ang = atan(vXY.y, vXY.x);

    // Bandas concêntricas de largura irregular: sem isso o anel lê como um
    // aro chapado de CD.
    float bands =
      0.55 +
      0.45 * sin(t * 46.0) *
      (0.6 + 0.4 * sin(t * 13.0 + 1.7));
    bands = clamp(bands, 0.0, 1.0);

    // Duas falhas escuras, como a divisão de Cassini.
    float gap = smoothstep(0.02, 0.06, abs(t - 0.38)) * smoothstep(0.015, 0.05, abs(t - 0.68));

    // Granulação: poeira em vez de superfície lisa.
    float grain = 0.75 + 0.25 * hash(vec2(floor(t * 260.0), floor(ang * 150.0)));

    // Esmaece nas duas bordas da faixa.
    float fade = smoothstep(0.0, 0.16, t) * (1.0 - smoothstep(0.8, 1.0, t));

    // Respiração lenta para o anel não ficar estático como um decalque.
    float breathe = 0.9 + 0.1 * sin(uTime * 0.5 + t * 3.0);

    float a = bands * gap * grain * fade * uOpacity * breathe;
    if (a < 0.004) discard;

    vec3 color = mix(uColor, uWarm, t);
    gl_FragColor = vec4(color, a);
  }
`

export function SaturnRing({ reduced }: { reduced: boolean }) {
  const mesh = useRef<THREE.Mesh>(null)

  const geometry = useMemo(
    () => new THREE.RingGeometry(RING_INNER, RING_OUTER, 220, 8),
    [],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uInner: { value: RING_INNER },
          uOuter: { value: RING_OUTER },
          uColor: { value: new THREE.Color("#4E7EC4") },
          uWarm: { value: new THREE.Color("#A9C4E8") },
          uOpacity: { value: 0.22 },
          uTime: { value: 0 },
        },
      }),
    [],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame((state) => {
    if (reduced) return
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      // Deita o anel (RingGeometry nasce em pé no plano XY) e aplica a MESMA
      // inclinação usada no cálculo da órbita.
      rotation={[-Math.PI / 2 + ORBIT.tilt, 0, 0]}
    />
  )
}
