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
  // ── Traços adicionados na revisão de 23/07/2026 ────────────────────────────
  // Todos opcionais na leitura (configs salvos antes disso não os têm): o
  // normalize() preenche com o padrão antes de desenhar.
  build?: number // compleição: magro / médio / forte
  faceShape?: number // formato do rosto
  eyes?: number // formato dos olhos
  eyeColor?: number // cor da íris (independente do tom de pele)
  brow?: number // sobrancelha
  mouth?: number // boca
  beard?: number // barba / bigode
}

/** Preenche traços novos em configs antigos — o desenho nunca vê `undefined`. */
export function normalizeConfig(config: AvatarConfig): Required<AvatarConfig> {
  return {
    ...config,
    build: config.build ?? 1,
    faceShape: config.faceShape ?? 0,
    eyes: config.eyes ?? 0,
    eyeColor: config.eyeColor ?? 0,
    brow: config.brow ?? 0,
    mouth: config.mouth ?? 0,
    beard: config.beard ?? 0,
  }
}

// Paletas Stardew clássico: dessaturadas e terrosas, nunca vibrantes.
// (Mesmos comprimentos de antes — presets/validadores indexam por posição.)
export const PAL = {
  skin: ["#f5deb3", "#e8b89a", "#d4a373", "#a0723c", "#7d4e2a", "#5c3a1e", "#eecfa8", "#c08a5a"],
  hair: ["#1a1a1a", "#4a2c1a", "#8b4513", "#c68642", "#e8c39e", "#c94f30", "#8a6ba0", "#444a55", "#d8d2c8", "#c48ba0", "#5a7ba5", "#6b8e5a", "#7a5a8a", "#2b2118", "#a06a3a"],
  shirt: ["#4a6fa5", "#a54a3c", "#6b8e5a", "#c9a04a", "#7a6ba0", "#b58a97", "#3a3f4b", "#d8d2c8", "#4a7a70", "#b0653f", "#2c3a50", "#33302c", "#4a6fa5", "#5d8a52", "#c9a04a"],
  pants: ["#2c3e5a", "#33302c", "#5c3a1e", "#5a5a5a", "#6b4a5a", "#3d5445", "#5a5a5a", "#2c3a50", "#3a3a40", "#54415a", "#37514d"],
  shoe: ["#2b2118", "#3a3f4b", "#8a4438", "#c9c2b5", "#4a5a78", "#6b4423", "#4d6b4a", "#a08040"],
  // Íris: dessaturada como o resto da paleta — olho saturado puxa toda a
  // atenção num rosto de 6px.
  eye: ["#4a6fa5", "#5d8a52", "#6b4423", "#3d5445", "#5a5a6b", "#7a5a3a", "#2c3e5a", "#8a6ba0"],
} as const

export const BUILDS = ["Magro", "Médio", "Forte"]
export const FACE_SHAPES = ["Oval", "Quadrado", "Redondo"]
export const EYE_SHAPES = ["Normal", "Grande", "Fino", "Caído"]
export const BROWS = ["Reta", "Arqueada", "Grossa", "Fina"]
export const MOUTHS = ["Neutra", "Sorriso", "Séria", "Aberta"]
export const BEARDS = ["Nenhuma", "Cavanhaque", "Bigode", "Cheia", "Costeleta"]

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
  // idle tem 8 frames para caber a piscada (frame 6) sem acelerar a respiração;
  // walk tem 4 — o ciclo clássico contato/passagem/contato/passagem.
  idle: 8, walk: 4, run: 6, push: 4, jump: 5, hurt: 3,
  wave: 5, dance: 8, jamal: 8, dab: 4, floss: 6,
  punch: 4, getHit: 4, block: 3, type: 4, present: 4, coffee: 4, sleep: 4, celebrate: 6, lean: 4,
}
export type AnimName = keyof typeof ANIMS | string

export const ANIM_LABELS: Record<string, string> = {
  idle: "Parado", walk: "Andar", run: "Correr", push: "Empurrar", jump: "Pular", hurt: "Tomar dano",
  wave: "Acenar", dance: "Dançar", jamal: "Passinho do Jamal", dab: "Dab", floss: "Floss",
  punch: "Socar", getHit: "Levar soco", block: "Defender",
  type: "Digitar", present: "Apresentar", coffee: "Café", sleep: "Dormir", celebrate: "Comemorar", lean: "Apoiado",
}

// FPS sugerido por animação.
export const ANIM_FPS: Record<string, number> = {
  jamal: 8.7, dance: 8, floss: 9, dab: 6, celebrate: 10, run: 12, walk: 8,
  punch: 10, getHit: 9, wave: 7, sleep: 3, type: 7, coffee: 5, idle: 4, lean: 3,
}

export type Direction = "down" | "up" | "left" | "right"
export const DIRS: Direction[] = ["down", "up", "left", "right"]

// Grid 16×32 — mesmo do Stardew Valley original. Não aumentar: resolução
// maior quebra a proporção característica do estilo.
export const FW = 16
export const FH = 32

export const DEFAULT_AVATAR: AvatarConfig = {
  gender: "male", name: "Funcionário",
  skin: 0, hair: 1, hairStyle: 0,
  top: 0, shirt: 0,
  bottom: 0, pants: 0,
  shoeType: 0, shoe: 0,
  acc: 0, hand: 0,
  build: 1, faceShape: 0, eyes: 0, eyeColor: 0, brow: 0, mouth: 0, beard: 0,
}
