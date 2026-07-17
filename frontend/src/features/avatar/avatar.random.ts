// Randomização de avatar com seed opcional (princípio do spec do gerador:
// reprodutibilidade + acessório com probabilidade ~40%).
import {
  ACCESSORIES,
  BOTTOMS,
  HAIR_STYLES,
  HANDHELDS,
  PAL,
  SHOES,
  TOPS,
  type AvatarConfig,
} from "./avatar.types"

// PRNG mulberry32 — determinístico a partir de uma seed inteira.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ACCESSORY_CHANCE = 0.4

export function randomAvatar(seed?: number, name = "Aleatório"): AvatarConfig {
  const rnd = seed === undefined ? Math.random : mulberry32(seed)
  const pick = (n: number) => Math.floor(rnd() * n)

  return {
    gender: rnd() < 0.5 ? "male" : "female",
    name,
    skin: pick(PAL.skin.length),
    hair: pick(PAL.hair.length),
    hairStyle: pick(HAIR_STYLES.length),
    top: pick(TOPS.length),
    shirt: pick(PAL.shirt.length),
    bottom: pick(BOTTOMS.length),
    pants: pick(PAL.pants.length),
    shoeType: pick(SHOES.length),
    shoe: pick(PAL.shoe.length),
    // Índice 0 é "Nenhum" — acessório aparece em ~40% dos sorteios.
    acc: rnd() < ACCESSORY_CHANCE ? 1 + pick(ACCESSORIES.length - 1) : 0,
    hand: rnd() < ACCESSORY_CHANCE ? 1 + pick(HANDHELDS.length - 1) : 0,
  }
}

// Ordem de revelação do efeito cascata na UI (categoria por categoria).
export const CASCADE_FIELDS: (keyof AvatarConfig)[] = [
  "gender",
  "skin",
  "hairStyle",
  "hair",
  "top",
  "shirt",
  "bottom",
  "pants",
  "shoeType",
  "shoe",
  "acc",
  "hand",
]
