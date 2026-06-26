// src/features/avatar/avatar.types.ts
export interface AvatarConfig {
  skin: number      // 0-4
  cloth: number     // 0-5
  hair: number      // 0-3
  accessory: number // 0-2 (0=nenhum, 1=óculos, 2=fone)
  configured: boolean
}
