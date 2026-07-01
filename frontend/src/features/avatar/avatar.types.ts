// Configuração e catálogos do avatar chibi. Espelha o "Chibi Avatar Lab"
// original, mas como dados tipados — o desenho vive em chibi.ts (Canvas 2D puro,
// sem PixiJS). Mantém consistência com o Escritório pixelado já existente.

export type Gender = "male" | "female"

export interface AvatarConfig {
  gender: Gender
  name: string
  skin: number
  hair: number
  hairStyle: number
  top: number // formato do torso
  shirt: number // cor do torso
  bottom: number // formato inferior
  pants: number // cor inferior
  shoeType: number
  shoe: number
  acc: number // acessório de cabeça/corpo
  hand: number // item de mão/costas
}

// Paletas customizáveis (cor é conteúdo do avatar; não viola o P&B da UI).
export const PAL = {
  skin: ["#ffd9b3", "#f1c197", "#e0a877", "#c68642", "#8d5524", "#5c3a21", "#ffe0c4", "#d8a06a"],
  hair: ["#2b2118", "#5a3a22", "#8a5a2b", "#c9963f", "#e8c66b", "#d94f4f", "#7c6cff", "#444a55", "#f0f0f0", "#ff6fa5", "#3aa0ff", "#39d98a", "#9b59b6", "#1a1a1a", "#b87333"],
  shirt: ["#5b7fd9", "#d94f4f", "#5ddba0", "#ffb84d", "#7c6cff", "#ff6fa5", "#3a3f4b", "#f0f0f0", "#2a9d8f", "#e76f51", "#1e2230", "#222", "#0a84ff", "#34c759", "#ffcc00"],
  pants: ["#3a4a6b", "#2b2b35", "#6b4a2b", "#4b5563", "#7c4a6b", "#2f5d4a", "#5b5b5b", "#1e2230", "#3a3a44", "#5a3a5a", "#264653"],
  shoe: ["#2b2118", "#3a3f4b", "#d94f4f", "#f0f0f0", "#5b7fd9", "#8a5a2b", "#39d98a", "#ffcc00"],
} as const

export const HAIR_STYLES = [
  "Curto", "Médio", "Topete", "Rabo", "Coque", "Carequinha",
  "Moicano", "Cacheado", "Longo", "Maria-chiquinhas", "Undercut", "Franjão",
]

export const TOPS = [
  "Camiseta", "Social", "Moletom", "Regata", "Jaleco", "Hoodie", "Polo", "Vestido", "Terno", "Time",
]

export const BOTTOMS = ["Calça", "Jeans", "Shorts", "Saia", "Legging", "Bermuda"]

export const SHOES = ["Tênis", "Social", "Bota", "Sandália", "Sapatilha"]

export const ACCESSORIES = [
  "Nenhum", "Óculos", "Boné", "Brinco", "Fone de ouvido", "Crachá", "Smartwatch", "Óculos VR", "Gorro",
]

export const HANDHELDS = [
  "Nenhum", "Laptop", "Mochila", "Caneca de café", "Celular", "Prancheta", "Caixa",
]

// Animações: frames por clipe.
export const ANIMS: Record<string, number> = {
  idle: 4, walk: 6, run: 6, push: 4, jump: 5, hurt: 3,
  wave: 5, dance: 8, jamal: 8, dab: 4, floss: 6,
  punch: 4, getHit: 4, block: 3, type: 4, present: 4, coffee: 4, sleep: 4, celebrate: 6,
}
export type AnimName = keyof typeof ANIMS | string

export const ANIM_LABELS: Record<string, string> = {
  idle: "Parado", walk: "Andar", run: "Correr", push: "Empurrar", jump: "Pular", hurt: "Tomar dano",
  wave: "Acenar", dance: "Dançar", jamal: "Passinho do Jamal", dab: "Dab", floss: "Floss",
  punch: "Socar", getHit: "Levar soco", block: "Defender",
  type: "Digitar", present: "Apresentar", coffee: "Café", sleep: "Dormir", celebrate: "Comemorar",
}

// FPS sugerido por animação.
export const ANIM_FPS: Record<string, number> = {
  jamal: 8.7, dance: 8, floss: 9, dab: 6, celebrate: 10, run: 12, walk: 8,
  punch: 10, getHit: 9, wave: 7, sleep: 3, type: 7, coffee: 5, idle: 4,
}

export type Direction = "down" | "up" | "left" | "right"
export const DIRS: Direction[] = ["down", "up", "left", "right"]

export const FW = 32
export const FH = 32

export const DEFAULT_AVATAR: AvatarConfig = {
  gender: "male", name: "Funcionário",
  skin: 0, hair: 1, hairStyle: 0,
  top: 0, shirt: 0,
  bottom: 0, pants: 0,
  shoeType: 0, shoe: 0,
  acc: 0, hand: 0,
}
