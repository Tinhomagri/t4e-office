// src/features/avatar/avatarRenderer.ts
// Sistema de compositing para Kenney Roguelike Characters (16×16px, 1px de margem)

export const TILE = 16
const STEP = 17  // TILE + 1px de margem

function tx(col: number): number { return col * STEP }
function ty(row: number): number { return row * STEP }

// Corpo base: col=0, linhas 0-3 (tons de pele)
// Linha 0: claro, 1: médio-claro, 2: médio-escuro, 3: verde (fantasia)

// Roupa [col, linha] — overlay transparente sobre o corpo
export const CLOTH_TILES: [number, number][] = [
  [6,  0],  // laranja
  [10, 0],  // teal
  [14, 0],  // roxo
  [6,  4],  // marrom/bege
  [6,  5],  // verde
  [10, 4],  // prata/cinza
]

// Cabelo [col, linha]
export const HAIR_TILES: [number, number][] = [
  [20, 0],  // castanho escuro
  [24, 0],  // ruivo/laranja
  [28, 0],  // grisalho
  [20, 1],  // castanho médio
]

// Acessório facial [col, linha] ou null para nenhum
export const ACCESSORY_TILES: ([number, number] | null)[] = [
  null,     // nenhum
  [3, 0],   // óculos preto
  [3, 3],   // óculos dourado
]

// Cache singleton da imagem para uso no DOM (AvatarCustomizer)
let _sheet: HTMLImageElement | null = null

export function getSheetAsync(): Promise<HTMLImageElement> {
  if (_sheet?.complete) return Promise.resolve(_sheet)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => { _sheet = img; resolve(img) }
    img.onerror = reject
    img.src = '/assets/characters/roguelike.png'
  })
}

export function compositeAvatar(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  skin: number,
  cloth: number,
  hair: number,
  accessory: number,
): void {
  ctx.clearRect(0, 0, TILE, TILE)

  // Camada 1: corpo (tom de pele)
  const skinRow = Math.max(0, Math.min(3, skin))
  ctx.drawImage(src, tx(0), ty(skinRow), TILE, TILE, 0, 0, TILE, TILE)

  // Camada 2: roupa
  const [cc, cr] = CLOTH_TILES[Math.max(0, Math.min(5, cloth))]
  ctx.drawImage(src, tx(cc), ty(cr), TILE, TILE, 0, 0, TILE, TILE)

  // Camada 3: cabelo
  const [hc, hr] = HAIR_TILES[Math.max(0, Math.min(3, hair))]
  ctx.drawImage(src, tx(hc), ty(hr), TILE, TILE, 0, 0, TILE, TILE)

  // Camada 4: acessório facial (opcional)
  const acc = ACCESSORY_TILES[Math.max(0, Math.min(2, accessory))]
  if (acc) {
    ctx.drawImage(src, tx(acc[0]), ty(acc[1]), TILE, TILE, 0, 0, TILE, TILE)
  }
}

export function makeAvatarTexKey(skin: number, cloth: number, hair: number, accessory: number): string {
  return `rog_s${skin}_c${cloth}_h${hair}_a${accessory}`
}
