// Único lugar que decide se uma tecla vale para o mapa.
//
// Existe separado porque o PC do escritório precisa desligar o teclado do mundo:
// com o desktop aberto, digitar num campo não pode fazer o avatar andar.

export type KeyAction = "move" | "interact" | "ignore"

const MOVE_KEYS = new Set([
  "w", "a", "s", "d",
  "arrowup", "arrowdown", "arrowleft", "arrowright",
  "shift",
])

export function keyAction(rawKey: string, enabled: boolean): KeyAction {
  if (!enabled) return "ignore"
  const k = rawKey.toLowerCase()
  if (MOVE_KEYS.has(k)) return "move"
  if (k === "e") return "interact"
  return "ignore"
}
