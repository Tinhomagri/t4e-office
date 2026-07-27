// Regras do elevador, sem DOM.
//
// A decisão "posso ir para este andar?" fica aqui porque é a única parte do
// elevador que dá para provar em teste — o resto é pintura e transição.
import { type FloorDef } from "./floors"

/** Andar com planta registrada. Sem planta = em obras. */
export function isUnlocked(def: FloorDef): boolean {
  return typeof def.build === "function"
}

export function canGoTo(floors: FloorDef[], from: number, to: number): boolean {
  if (from === to) return false
  const def = floors.find((f) => f.n === to)
  return !!def && isUnlocked(def)
}

export interface FloorButton {
  n: number
  label: string
  locked: boolean
  current: boolean
}

/** Botões do painel, do andar mais alto para o mais baixo. */
export function floorButtons(floors: FloorDef[], current: number): FloorButton[] {
  return [...floors]
    .sort((a, b) => b.n - a.n)
    .map((f) => ({
      n: f.n,
      label: f.label,
      locked: !isUnlocked(f),
      current: f.n === current,
    }))
}
