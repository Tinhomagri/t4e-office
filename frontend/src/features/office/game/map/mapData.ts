export const TILE_SIZE = 32
export const MAP_W = 22   // tiles
export const MAP_H = 38   // tiles

export enum TileType {
  FLOOR    = 0,
  WALL     = 1,
  DESK     = 2,
  CHAIR_W  = 3,  // cadeira branca
  CHAIR_D  = 4,  // cadeira escura
  PLANT    = 5,
  RUG      = 6,
  GLASS    = 7,
  SOFA     = 8,
  COFFEE   = 9,
  LOGO     = 10,
  CABINET  = 11,
}

// Cores para cada tipo de tile
export const TILE_COLORS: Record<TileType, number> = {
  [TileType.FLOOR]:   0xf2f0ec,
  [TileType.WALL]:    0xdde0e5,
  [TileType.DESK]:    0x33373c,
  [TileType.CHAIR_W]: 0xeceef0,
  [TileType.CHAIR_D]: 0x3a3d42,
  [TileType.PLANT]:   0x6aa84f,
  [TileType.RUG]:     0xdfe3df,
  [TileType.GLASS]:   0xcfe0ea,
  [TileType.SOFA]:    0x2c2f33,
  [TileType.COFFEE]:  0x9aa0a6,
  [TileType.LOGO]:    0xf2f0ec,
  [TileType.CABINET]: 0x33373c,
}

// Tiles que bloqueiam passagem
export const SOLID_TILES = new Set<TileType>([
  TileType.WALL, TileType.DESK, TileType.SOFA, TileType.CABINET,
])

// Gera mapa 22×38
// W=parede, F=floor, D=desk, C=chair branca, c=chair escura
// P=plant, R=rug, G=glass, S=sofa, K=café, L=logo, A=cabinet
const W = TileType.WALL
const F = TileType.FLOOR
const D = TileType.DESK
const Cw = TileType.CHAIR_W
const Cd = TileType.CHAIR_D
const P = TileType.PLANT
const R = TileType.RUG
const G = TileType.GLASS
const S = TileType.SOFA
const K = TileType.COFFEE
const L = TileType.LOGO
const A = TileType.CABINET

// prettier-ignore
export const MAP_TILES: TileType[][] = [
  // row 0 — parede norte
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // row 1 — logo T4E (fundo)
  [W,L,L,L,L,L,L,L,L,L,L,L,L,L,L,L,L,L,L,L,L,W],
  // row 2
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  // row 3 — grupo 1 (cadeiras norte)
  [W,F,F,Cd,F,Cw,F,F,F,F,F,F,F,F,F,Cd,F,Cw,F,F,F,W],
  // row 4 — grupo 1 (mesas norte)
  [W,F,F,D, F,D, F,F,F,F,F,F,F,F,F,D, F,D, F,F,F,W],
  // row 5 — grupo 1 (mesas sul)
  [W,F,F,D, F,D, F,F,F,F,F,F,F,F,F,D, F,D, F,F,F,W],
  // row 6 — grupo 1 (cadeiras sul)
  [W,F,F,Cw,F,Cd,F,F,F,F,F,F,F,F,F,Cw,F,Cd,F,F,F,W],
  // row 7 — corredor
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  // row 8 — corredor
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  // row 9 — grupo 2 (cadeiras norte)
  [W,F,F,Cd,F,Cw,F,F,F,F,F,F,F,F,F,Cd,F,Cw,F,F,F,W],
  // row 10 — grupo 2 (mesas norte)
  [W,F,F,D, F,D, F,F,F,F,F,F,F,F,F,D, F,D, F,F,F,W],
  // row 11 — grupo 2 (mesas sul)
  [W,F,F,D, F,D, F,F,F,F,F,F,F,F,F,D, F,D, F,F,F,W],
  // row 12 — grupo 2 (cadeiras sul)
  [W,F,F,Cw,F,Cd,F,F,F,F,F,F,F,F,F,Cw,F,Cd,F,F,F,W],
  // row 13 — corredor
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  // row 14 — corredor
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  // row 15 — grupo 3 (cadeiras norte)
  [W,F,F,Cd,F,Cw,F,F,F,F,F,F,F,F,F,Cd,F,Cw,F,F,F,W],
  // row 16 — grupo 3 (mesas norte)
  [W,F,F,D, F,D, F,F,F,F,F,F,F,F,F,D, F,D, F,F,F,W],
  // row 17 — grupo 3 (mesas sul)
  [W,F,F,D, F,D, F,F,F,F,F,F,F,F,F,D, F,D, F,F,F,W],
  // row 18 — grupo 3 (cadeiras sul)
  [W,F,F,Cw,F,Cd,F,F,F,F,F,F,F,F,F,Cw,F,Cd,F,F,F,W],
  // row 19 — corredor
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  // row 20 — corredor
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  // row 21 — grupo 4 (cadeiras norte)
  [W,F,F,Cd,F,Cw,F,F,F,F,F,F,F,F,F,Cd,F,Cw,F,F,F,W],
  // row 22 — grupo 4 (mesas norte)
  [W,F,F,D, F,D, F,F,F,F,F,F,F,F,F,D, F,D, F,F,F,W],
  // row 23 — grupo 4 (mesas sul)
  [W,F,F,D, F,D, F,F,F,F,F,F,F,F,F,D, F,D, F,F,F,W],
  // row 24 — grupo 4 (cadeiras sul)
  [W,F,F,Cw,F,Cd,F,F,F,F,F,F,F,F,F,Cw,F,Cd,F,F,F,W],
  // row 25 — corredor
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  // row 26 — corredor
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  // row 27 — grupo 5 (cadeiras norte)
  [W,F,F,Cd,F,Cw,F,F,F,F,F,F,F,F,F,Cd,F,Cw,F,F,F,W],
  // row 28 — grupo 5 (mesas norte)
  [W,F,F,D, F,D, F,F,F,F,F,F,F,F,F,D, F,D, F,F,F,W],
  // row 29 — grupo 5 (mesas sul)
  [W,F,F,D, F,D, F,F,F,F,F,F,F,F,F,D, F,D, F,F,F,W],
  // row 30 — grupo 5 (cadeiras sul)
  [W,F,F,Cw,F,Cd,F,F,F,F,F,F,F,F,F,Cw,F,Cd,F,F,F,W],
  // row 31 — corredor lounge
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  // row 32 — lounge: tapete + poltronas
  [W,A,F,F,R,R,R,R,R,R,R,R,R,R,F,F,F,F,F,K,K,W],
  // row 33 — lounge
  [W,A,F,S,R,R,R,R,R,R,R,R,R,R,F,F,F,S,F,K,K,W],
  // row 34 — lounge
  [W,A,F,F,R,R,R,R,R,R,R,R,R,R,F,F,F,F,F,K,K,W],
  // row 35 — planta + espaço
  [W,P,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,P,W],
  // row 36 — porta de vidro
  [W,W,F,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,F,W,W],
  // row 37 — parede sul
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
]

// Posições das mesas no mapa (tile_x, tile_y) — usadas para detecção de proximidade
// Correspondem às posições D no MAP_TILES acima
export const DESK_TILE_POSITIONS: Array<{ tx: number; ty: number; groupIdx: number }> = [
  // Grupo 1 (rows 4-5)
  {tx:3,ty:4,groupIdx:0},{tx:5,ty:4,groupIdx:0},
  {tx:3,ty:5,groupIdx:0},{tx:5,ty:5,groupIdx:0},
  // Grupo 1 direito (rows 4-5)
  {tx:15,ty:4,groupIdx:1},{tx:17,ty:4,groupIdx:1},
  {tx:15,ty:5,groupIdx:1},{tx:17,ty:5,groupIdx:1},
  // Grupo 2 (rows 10-11)
  {tx:3,ty:10,groupIdx:2},{tx:5,ty:10,groupIdx:2},
  {tx:3,ty:11,groupIdx:2},{tx:5,ty:11,groupIdx:2},
  // Grupo 2 direito (rows 10-11)
  {tx:15,ty:10,groupIdx:3},{tx:17,ty:10,groupIdx:3},
  {tx:15,ty:11,groupIdx:3},{tx:17,ty:11,groupIdx:3},
  // Grupo 3 (rows 16-17)
  {tx:3,ty:16,groupIdx:4},{tx:5,ty:16,groupIdx:4},
  {tx:3,ty:17,groupIdx:4},{tx:5,ty:17,groupIdx:4},
  // Grupo 3 direito (rows 16-17)
  {tx:15,ty:16,groupIdx:5},{tx:17,ty:16,groupIdx:5},
  {tx:15,ty:17,groupIdx:5},{tx:17,ty:17,groupIdx:5},
]
