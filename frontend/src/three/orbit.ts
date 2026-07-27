// Matemática da órbita da nave em volta do glifo.
//
// Sem three.js: é trigonometria pura sobre uma elipse inclinada, o que torna
// o caminho testável sem WebGL. A cena só consome as posições.

export interface OrbitParams {
  /** Semi-eixo horizontal. */
  radiusX: number
  /** Profundidade da elipse (o quanto a nave vai para trás/frente). */
  radiusZ: number
  /** Amplitude da ondulação vertical ao longo da volta. */
  bobY: number
  /** Inclinação do plano da órbita, em radianos. */
  tilt: number
  /** Segundos por volta completa. */
  period: number
}

// Órbita CIRCULAR (radiusX = radiusZ) e sem ondulação vertical: a nave corre
// dentro do anel de Saturno, e para isso precisa estar exatamente no plano dele.
// Quem torna a trajetória interessante é a inclinação do plano, não a forma.
export const ORBIT: OrbitParams = {
  // Cabe na meia-largura visível do painel (~4 unidades): acima disso a nave
  // sai de quadro em vez de orbitar.
  radiusX: 2.85,
  radiusZ: 2.85,
  bobY: 0,
  tilt: 0.42,
  period: 16,
}

/** Faixa do anel. O raio da órbita cai no meio dela — a nave corre no trilho. */
export const RING_INNER = 2.3
export const RING_OUTER = 3.35

export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * Posição da nave no instante `t` (segundos). O plano da elipse é girado em
 * torno do eixo X pelo `tilt`, então a volta não é um anel chapado.
 */
export function orbitPosition(t: number, p: OrbitParams = ORBIT, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const a = (t / p.period) * Math.PI * 2
  const x = Math.cos(a) * p.radiusX
  const z = Math.sin(a) * p.radiusZ
  // Ondulação vertical no dobro da frequência: sobe e desce duas vezes por
  // volta, o que dá a sensação de voo em vez de trilho.
  const y0 = Math.sin(a * 2) * p.bobY

  // Rotação do plano em torno de X.
  const c = Math.cos(p.tilt)
  const s = Math.sin(p.tilt)
  out.x = x
  out.y = y0 * c - z * s
  out.z = y0 * s + z * c
  return out
}

/**
 * Ângulo de guinada (yaw) tangente à trajetória: a nave aponta para onde vai.
 * Derivado numericamente para não precisar reescrever a derivada quando os
 * parâmetros da órbita mudarem.
 */
export function orbitHeading(t: number, p: OrbitParams = ORBIT): number {
  const eps = 0.016
  const a = orbitPosition(t, p, { x: 0, y: 0, z: 0 })
  const b = orbitPosition(t + eps, p, { x: 0, y: 0, z: 0 })
  return Math.atan2(b.x - a.x, b.z - a.z)
}

/**
 * Inclinação lateral (roll) proporcional à curvatura horizontal: a nave "deita"
 * na curva como um avião. Sai em radianos, limitado a `max`.
 */
export function orbitBank(t: number, p: OrbitParams = ORBIT, max = 0.5): number {
  const eps = 0.05
  const h0 = orbitHeading(t - eps, p)
  const h1 = orbitHeading(t + eps, p)
  // Diferença angular normalizada para [-π, π]: sem isso a virada de -π→π
  // produz um espasmo de rolagem uma vez por volta.
  let d = h1 - h0
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  const rate = d / (2 * eps)
  return Math.max(-max, Math.min(max, -rate * 0.55))
}

/**
 * Interpolação exponencial independente de framerate. Serve tanto para o rabo
 * do gato quanto para a cabeça acompanhando o cursor.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}
