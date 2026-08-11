// Geometria da mesa: tamanho do tampo, onde cada assento senta na órbita e
// onde o cartão de câmera se ancora. Fica fora do componente porque é a única
// parte da mesa que dá para provar com teste — e foi justamente onde a câmera
// grande passou a cobrir a carta do vizinho.

export const SEATS_MAX = 10

/** Largura útil da coluna do assento (carta/sprite/nome) — `w-20` no JSX. */
export const SEAT_COL_W = 80
/** Altura da caixa do assento: carta 52 + corpo 72 + nome. */
export const SEAT_BOX_H = 150

/** Cartão de câmera. Maior que o do Escritório: aqui a mesa é a tela toda. */
export const TILE_W = 128
export const TILE_H = 96

/** Folga entre a borda do tampo e o centro do assento. */
const ORBIT_PAD_X = 52
const ORBIT_PAD_Y = 46
/**
 * Com câmera ligada a órbita abre na vertical: os assentos de cima e de baixo
 * são os que mais se aproximam quando a mesa enche, e é lá que o cartão de
 * vídeo encostava na carta do vizinho.
 */
const ORBIT_PAD_Y_VIDEO = 70

/** Respiro entre a caixa do assento e o cartão de vídeo. */
const TILE_GAP = 8

/**
 * Quanto o cartão precisa andar para FORA, ao longo da direção radial, para
 * sair inteiro de cima do próprio assento.
 *
 * Distância fixa não serve: na diagonal, o mesmo passo separa muito menos em
 * cada eixo do que na vertical pura. Aqui a conta é o eixo separador — basta
 * limpar a caixa em X **ou** em Y, e o menor dos dois é o passo mínimo.
 */
function tileDistance(dirX: number, dirY: number): number {
  const needX = (SEAT_COL_W + TILE_W) / 2 + TILE_GAP
  const needY = (SEAT_BOX_H + TILE_H) / 2 + TILE_GAP
  const byX = Math.abs(dirX) > 1e-6 ? needX / Math.abs(dirX) : Infinity
  const byY = Math.abs(dirY) > 1e-6 ? needY / Math.abs(dirY) : Infinity
  return Math.min(byX, byY)
}

/** Margem do wrapper — precisa conter o assento e, com vídeo, o cartão. */
export function wrapperMargins(videoActive: boolean): { x: number; y: number } {
  // Sem vídeo, a margem só precisa conter a caixa do assento (o +1 é o que
  // faltava para o assento do topo não estourar o wrapper por um pixel).
  if (!videoActive) return { x: 120, y: ORBIT_PAD_Y + SEAT_BOX_H / 2 }
  return {
    x: ORBIT_PAD_X + tileDistance(1, 0) + TILE_W / 2,
    y: ORBIT_PAD_Y_VIDEO + tileDistance(0, 1) + TILE_H / 2,
  }
}

/** Mesa se ajusta ao número de participantes. */
export function tableSize(count: number): { width: number; height: number } {
  if (count <= 2) return { width: 340, height: 200 }
  if (count <= 4) return { width: 430, height: 240 }
  if (count <= 7) return { width: 520, height: 280 }
  return { width: 600, height: 310 }
}

/**
 * Ângulos espaçados por COMPRIMENTO DE ARCO, começando no topo.
 *
 * Espaçar por ângulo (o jeito óbvio) amontoa gente nas laterais de uma elipse
 * achatada: o mesmo passo angular percorre muito menos arco onde a curva é
 * fechada. Com 10 na mesa isso empilhava três pessoas de cada lado.
 */
function arcAngles(total: number, rx: number, ry: number): number[] {
  const STEPS = 512
  const start = -Math.PI / 2
  const step = (2 * Math.PI) / STEPS
  const cum = [0]
  for (let k = 1; k <= STEPS; k++) {
    const mid = start + (k - 0.5) * step
    cum.push(cum[k - 1] + Math.hypot(-rx * Math.sin(mid), ry * Math.cos(mid)) * step)
  }
  const perimeter = cum[STEPS]
  return Array.from({ length: total }, (_, i) => {
    const target = (i / total) * perimeter
    let lo = 0
    let hi = STEPS
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cum[mid] < target) lo = mid + 1
      else hi = mid
    }
    return start + lo * step
  })
}

export interface SeatSlot {
  /** Centro da coluna do assento, em coordenadas do wrapper. */
  x: number
  y: number
  /** Centro do cartão de câmera, já deslocado para fora da mesa. */
  videoX: number
  videoY: number
  /**
   * As mesmas posições, medidas a partir do CENTRO do wrapper.
   *
   * É por elas que a tela deve posicionar: entrar na sala de mídia muda o
   * tamanho do wrapper, e como ele fica centralizado, o canto anda enquanto o
   * centro não. Ancorado no canto, todo o conteúdo deslizava e voltava no
   * frame em que a primeira câmera conectava.
   */
  ox: number
  oy: number
  videoOx: number
  videoOy: number
  angle: number
}

export function seatLayout(
  total: number,
  tableWidth: number,
  tableHeight: number,
  videoActive: boolean,
): SeatSlot[] {
  const margin = wrapperMargins(videoActive)
  const cx = tableWidth / 2 + margin.x
  const cy = tableHeight / 2 + margin.y
  const rx = tableWidth / 2 + ORBIT_PAD_X
  const ry = tableHeight / 2 + (videoActive ? ORBIT_PAD_Y_VIDEO : ORBIT_PAD_Y)
  return arcAngles(total, rx, ry).map((angle) => {
    const ox = rx * Math.cos(angle)
    const oy = ry * Math.sin(angle)
    const len = Math.hypot(ox, oy) || 1
    const dirX = ox / len
    const dirY = oy / len
    const step = tileDistance(dirX, dirY)
    const videoOx = ox + dirX * step
    const videoOy = oy + dirY * step
    return {
      x: cx + ox,
      y: cy + oy,
      videoX: cx + videoOx,
      videoY: cy + videoOy,
      ox,
      oy,
      videoOx,
      videoOy,
      angle,
    }
  })
}

/**
 * Fator de escala para a mesa caber no espaço disponível.
 *
 * A mesa cresce com o número de participantes e cresce de novo ao ligar as
 * câmeras — em telas comuns ela passa a exceder a área e cortava o baralho e
 * os controles do host. Encolher tudo junto preserva a geometria provada
 * acima; nunca amplia, porque pixel art esticada borra.
 */
export function fitScale(
  wrapper: { width: number; height: number },
  stage: { width: number; height: number },
): number {
  if (wrapper.width <= 0 || wrapper.height <= 0) return 1
  // Palco degenerado é medição inválida (ainda não montou, container sem
  // altura resolvida), não uma tela minúscula de verdade. Encolher por esse
  // número deixaria a mesa do tamanho de uma moeda; melhor manter o tamanho
  // natural e, no pior caso, cortar.
  if (stage.width < MIN_STAGE || stage.height < MIN_STAGE) return 1
  return Math.min(1, stage.width / wrapper.width, stage.height / wrapper.height)
}

const MIN_STAGE = 80
