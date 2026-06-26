// src/features/avatar/avatarRenderer.ts
// Mantém mesmas exportações de interface para não quebrar imports existentes

export const CHAR_NAMES = ['player', 'adventurer', 'female', 'soldier', 'zombie'] as const
export type CharName = typeof CHAR_NAMES[number]

export const CHAR_TINTS = [0xffffff, 0x88bbff, 0x88ffaa, 0xffaa66, 0xcc88ff, 0xff88bb]

export function getCharName(skin: number): CharName {
  return CHAR_NAMES[Math.max(0, Math.min(4, skin))]
}

export function getCharTint(cloth: number): number {
  return CHAR_TINTS[Math.max(0, Math.min(5, cloth))]
}

// Mantida por compatibilidade — não é mais usada pelo Phaser mas pode ser importada
export function generateAvatarSheet(_cfg: unknown): HTMLCanvasElement {
  return document.createElement('canvas')
}

// animKey mantida por compatibilidade
export function animKey(baseKey: string, dir: string): string {
  return `${baseKey}_${dir}`
}
