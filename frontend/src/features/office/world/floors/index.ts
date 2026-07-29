// Registry de andares — o único lugar do código que lista os andares do prédio.
//
// Andar sem `build` está em obras: aparece travado no painel do elevador. É
// assim que o andar 2 entra depois, sem tocar no motor nem no elevador.
import type { OfficeMap } from "../map"

import { buildFloor1 } from "./floor1"
import { buildFloor2 } from "./floor2"

export interface FloorDef {
  /** 1-based — é o número que aparece no painel do elevador. */
  n: number
  label: string
  /** Ausente = em obras. */
  build?: () => OfficeMap
}

export const FLOORS: FloorDef[] = [
  { n: 1, label: "Bullpen", build: buildFloor1 },
  { n: 2, label: "Planning Poker", build: buildFloor2 },
  { n: 3, label: "Copa e lounge" },
  { n: 4, label: "Foco" },
]

export function floorDef(n: number): FloorDef | undefined {
  return FLOORS.find((f) => f.n === n)
}

/** Planta do andar. Lança se o andar não existe ou está em obras. */
export function buildFloor(n: number): OfficeMap {
  const def = floorDef(n)
  if (!def) throw new Error(`Andar inexistente: ${n}`)
  if (!def.build) throw new Error(`Andar ${n} em obras`)
  return def.build()
}

export { buildFloor1 }
