import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Sparkles } from "lucide-react"
import { useEffect, useState } from "react"

import { EASE } from "@/shared/lib/motion"

// ─────────────────────────────────────────────────────────────────────────────
// Carrossel do painel de autenticação: uma funcionalidade do sistema por vez.
//
// Tudo é SVG e DOM — sem WebGL, sem imagem, sem fonte externa. A tela de login
// é o caminho crítico do produto e não pode depender de asset que talvez não
// carregue.
//
// O texto de cada slide SUBSTITUI a headline fixa que existia aqui. Ter as
// duas coisas fazia o visual e o título disputarem a mesma metade do painel, e
// o resultado era um gráfico apertado no meio.
// ─────────────────────────────────────────────────────────────────────────────

/** Quanto cada slide fica em cena. */
const DURATION = 5200

const SLIDES = [
  {
    key: "sprints",
    title: "Sprints que você acompanha",
    body: "Board, backlog e burndown no mesmo lugar. Dá para ver o time adiantado ou atrasado sem abrir planilha.",
    visual: SprintVisual,
  },
  {
    key: "reunioes",
    title: "Reuniões dentro do sistema",
    body: "Sala de vídeo própria, ligada ao card e ao projeto. Ninguém sai da ferramenta para conversar.",
    visual: MeetingVisual,
  },
  {
    key: "copiloto",
    title: "Um copiloto que já tem contexto",
    body: "Ele enxerga seus cards, sprints e documentos — então a resposta vem sobre o seu trabalho, não sobre trabalho em geral.",
    visual: CopilotVisual,
  },
  {
    key: "escritorio",
    title: "Um escritório que se atravessa",
    body: "Sala isométrica com andares, elevador e mesas. Você anda com o teclado, senta na sua mesa e vê no que cada um está mexendo.",
    visual: OfficeVisual,
  },
] as const

export function AuthCarousel() {
  // Sem movimento: mostra o primeiro slide e para. Conteúdo que troca sozinho
  // e não pode ser pausado é justamente o que essa preferência pede para
  // evitar (WCAG 2.2.2).
  const still = useReducedMotion()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (still) return
    const id = setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), DURATION)
    return () => clearTimeout(id)
  }, [index, still])

  const slide = SLIDES[index]
  const Visual = slide.visual

  return (
    <div className="pointer-events-none flex w-full max-w-[880px] flex-col">
      {/* Palco. Altura fixa para o texto abaixo não pular a cada troca — um
          slide mais alto que o outro empurraria a headline linha a linha. */}
      <div className="relative h-[420px]">
        {/* `mode="wait"`: o slide que sai precisa terminar antes de o próximo
            entrar. Em modo síncrono os dois ficam sobrepostos no meio do
            crossfade e, com ambos a meia opacidade, aparecem dois títulos
            legíveis um por cima do outro. */}
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={slide.key}
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, x: 26 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.42, ease: EASE }}
          >
            <Visual still={!!still} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative mt-8 h-[150px]">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={slide.key}
            className="absolute inset-x-0 top-0"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <h2 className="text-[42px] font-extrabold leading-[1.1] tracking-[-0.02em] text-paper">
              {slide.title}
            </h2>
            <p className="mt-4 max-w-[600px] text-[16px] leading-relaxed text-paper-400">
              {slide.body}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Indicador. Não é clicável de propósito: o painel inteiro é decorativo
          e marcado com aria-hidden, e um botão dentro dele seria um controle
          que o leitor de tela nunca anuncia. */}
      <div className="mt-2 flex items-center gap-2">
        {SLIDES.map((s, i) => (
          <span
            key={s.key}
            className={`relative h-[3px] overflow-hidden rounded-full bg-paper/15 transition-[width] duration-500 ${
              i === index ? "w-10" : "w-5"
            }`}
          >
            {i === index && (
              <motion.span
                key={`${s.key}-fill`}
                className="absolute inset-0 origin-left rounded-full bg-paper/70"
                initial={{ scaleX: still ? 1 : 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: still ? 0 : DURATION / 1000, ease: "linear" }}
              />
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Slide 1: burndown da sprint ─────────────────────────────────────────────

const VB = { w: 460, h: 250 }
const PAD = { left: 34, right: 34, top: 26, bottom: 30 }
const REMAINING = [32, 30, 26, 25, 19, 16, 9, 6]
const CAPACITY = 32
const PLOT_W = VB.w - PAD.left - PAD.right
const PLOT_H = VB.h - PAD.top - PAD.bottom
const BASE_Y = PAD.top + PLOT_H

const bx = (i: number) => PAD.left + (i * PLOT_W) / (REMAINING.length - 1)
const by = (v: number) => BASE_Y - (v / CAPACITY) * PLOT_H

const POINTS = REMAINING.map((v, i) => ({ x: bx(i), y: by(v) }))
const LINE = POINTS.map((p) => `${p.x},${p.y}`).join(" ")
const AREA = `${PAD.left},${BASE_Y} ${LINE} ${bx(REMAINING.length - 1)},${BASE_Y}`
const LAST = POINTS[POINTS.length - 1]

function SprintVisual({ still }: { still: boolean }) {
  return (
    <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="w-full" aria-hidden="true">
      <defs>
        <linearGradient id="ac-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#388BFF" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#388BFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={PAD.left}
          x2={VB.w - PAD.right}
          y1={PAD.top + t * PLOT_H}
          y2={PAD.top + t * PLOT_H}
          stroke="#FFFFFF"
          strokeOpacity={0.07}
        />
      ))}

      {/* Ritmo ideal. Sem essa referência, uma curva descendo não diz se o time
          está adiantado ou atrasado. */}
      <line
        x1={PAD.left}
        y1={by(CAPACITY)}
        x2={bx(REMAINING.length - 1)}
        y2={BASE_Y}
        stroke="#FFFFFF"
        strokeOpacity={0.22}
        strokeWidth={1}
        strokeDasharray="3 5"
      />

      <motion.polygon
        points={AREA}
        fill="url(#ac-area)"
        initial={still ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.7, ease: EASE }}
      />
      <motion.polyline
        points={LINE}
        fill="none"
        stroke="#388BFF"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={still ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: [0.32, 0.72, 0.35, 1] }}
      />

      {POINTS.slice(0, -1).map((p, i) => (
        <motion.circle
          key={p.x}
          cx={p.x}
          cy={p.y}
          r={3}
          fill="#0B0C0E"
          stroke="#388BFF"
          strokeWidth={2}
          initial={still ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ originX: `${p.x}px`, originY: `${p.y}px` }}
          transition={{ duration: 0.3, delay: 0.1 + i * 0.14, ease: EASE }}
        />
      ))}

      {!still && (
        <motion.circle
          cx={LAST.x}
          cy={LAST.y}
          fill="none"
          stroke="#4BCE97"
          strokeWidth={1.5}
          initial={{ r: 4, opacity: 0 }}
          animate={{ r: [4, 14], opacity: [0.55, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, delay: 1.2, ease: "easeOut" }}
        />
      )}
      <motion.circle
        cx={LAST.x}
        cy={LAST.y}
        r={4.5}
        fill="#4BCE97"
        initial={still ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ originX: `${LAST.x}px`, originY: `${LAST.y}px` }}
        transition={{ duration: 0.35, delay: 1.1, ease: EASE }}
      />
    </svg>
  )
}

// ─── Slide 2: reuniões ───────────────────────────────────────────────────────

const TILES = [
  { initials: "WF", color: "#388BFF", speaking: true },
  { initials: "AL", color: "#9F8FEF", speaking: false },
  { initials: "MC", color: "#FCA700", speaking: false },
  { initials: "RS", color: "#4BCE97", speaking: false },
]

function MeetingVisual({ still }: { still: boolean }) {
  return (
    <div className="w-full px-2">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex size-2">
          {!still && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-70" />
          )}
          <span className="relative inline-flex size-2 rounded-full bg-red-400" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-paper-400">
          Ao vivo · Daily do time
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {TILES.map((t, i) => (
          <motion.div
            key={t.initials}
            initial={still ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: i * 0.09, ease: EASE }}
            className="relative grid h-[112px] place-items-center rounded-xl border border-paper/10 bg-paper/[0.04]"
          >
            {/* Anel de quem está falando. É o detalhe que faz a grade ler como
                uma chamada acontecendo, e não como quatro caixas vazias. */}
            {t.speaking && !still && (
              <motion.span
                className="absolute inset-0 rounded-xl ring-2 ring-green-400"
                animate={{ opacity: [0.9, 0.25, 0.9] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
            <span
              className="grid size-11 place-items-center rounded-full text-[13px] font-bold text-ink"
              style={{ backgroundColor: t.color }}
            >
              {t.initials}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ─── Slide 3: copiloto ───────────────────────────────────────────────────────

/** Larguras das linhas "digitadas" pela resposta, em fração da caixa. */
const ANSWER_LINES = [1, 0.92, 0.64]

function CopilotVisual({ still }: { still: boolean }) {
  return (
    <div className="flex w-full flex-col gap-3 px-2">
      <motion.div
        initial={still ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="self-end rounded-2xl rounded-br-md bg-blue-500 px-4 py-2.5 text-[14px] font-medium text-white"
      >
        Como está a sprint 14?
      </motion.div>

      <motion.div
        initial={still ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35, ease: EASE }}
        className="w-full rounded-2xl rounded-bl-md border border-paper/10 bg-paper/[0.05] p-4"
      >
        <div className="mb-3 flex items-center gap-2">
          {/* Ícone em vez do glifo ✦: caractere Unicode depende de a fonte ter
              o desenho, e onde não tem vira retângulo vazio. */}
          <span className="grid size-5 place-items-center rounded-md bg-purple-400/20">
            <Sparkles className="size-3 text-purple-300" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-purple-300">
            Copiloto
          </span>
        </div>

        {/* Linhas "digitando". Escala em X, nunca largura: animar width força
            recálculo de layout a cada frame. */}
        <div className="flex flex-col gap-2">
          {ANSWER_LINES.map((w, i) => (
            <motion.span
              key={i}
              className="h-2.5 origin-left rounded-full bg-paper/20"
              style={{ width: `${w * 100}%` }}
              initial={still ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, delay: 0.6 + i * 0.22, ease: EASE }}
            />
          ))}
        </div>

        <motion.div
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 1.5, ease: EASE }}
          className="mt-4 flex items-center gap-2 text-[12px] text-paper-500"
        >
          <span className="size-1.5 rounded-full bg-green-400" />6 pontos restantes ·
          2 cards em risco
        </motion.div>
      </motion.div>
    </div>
  )
}

// ─── Slide 4: escritório isométrico ──────────────────────────────────────────
//
// Retrato do Escritório real (`features/office/world`). Nada aqui foi chutado —
// as proporções e as cores saíram da fonte do próprio mundo:
//
//   • projeção 2:1, como ISO_TILE_W/H = 32/16 em `iso.ts`;
//   • parede = bloco extrudado de WALL_HEIGHT 48 sobre tile de 16, ou seja
//     3× a altura do tile, com duas faces + tampa (`isoBake.ts`). O comentário
//     lá é explícito: "pode ficar bem alta, tipo Habbo";
//   • só existem as paredes NORTE e OESTE — frente e direita não têm tile de
//     parede, e é isso que deixa o cômodo aberto para a câmera;
//   • ordem de pintura por (coluna + linha) crescente, igual ao bake;
//   • paleta de `tiles.ts`; contorno café #2b1e1a, nunca preto puro;
//   • avatar nas âncoras de `chibi.ts` — 16×32, cabeça de 8px em y6..13,
//     pescoço de 2px, tronco y14..23, pernas y24..29, sapato y30..31.
//
// É SVG redesenhado, não o engine: trazer o motor (canvas + loop de simulação
// em passo fixo) para o login custaria caro numa tela onde a pessoa só quer
// digitar a senha.

const TW = 64
const TH = 32
/** 3× a altura do tile, como WALL_HEIGHT/ISO_TILE_H no bake. */
const WALL_H = TH * 3
const ORIGIN = { x: 336, y: 118 }
/** A coluna 0 e a linha 0 são parede; o piso é o miolo. */
const COLS = 6
const ROWS = 5

const C = {
  ink: "#2b1e1a",
  wood: "#a87d51",
  woodDark: "#8a6440",
  woodSeam: "#6f4f33",
  carpet: "#5f7b7a",
  carpetDark: "#4c6564",
  wall: "#d9cfba",
  wallShade: "#c2b7a1",
  wallTop: "#7d766a",
  wainscot: "#7d5b41",
  wainscotDark: "#63462f",
  steel: "#9aa0a8",
  metalDark: "#767c85",
  plant: "#5d8a52",
  plantDark: "#456b3d",
  indicator: "#e8d24a",
}

function iso(c: number, r: number) {
  return {
    x: ORIGIN.x + ((c - r) * TW) / 2,
    y: ORIGIN.y + ((c + r) * TH) / 2,
  }
}

/** Losango do piso, na altura `lift`. */
function diamond(c: number, r: number, lift = 0) {
  const { x, y } = iso(c, r)
  const t = y - lift
  return `${x},${t - TH / 2} ${x + TW / 2},${t} ${x},${t + TH / 2} ${x - TW / 2},${t}`
}

const isWall = (c: number, r: number) => c === 0 || r === 0
/** Porta do elevador: um tile da parede norte, como T.ELEVATOR_DOOR no mapa. */
const ELEVATOR = { c: 4, r: 0 }
const CARPET = new Set(["2,2", "3,2", "2,3", "3,3"])

const OFFICE_DESKS = [
  { c: 1, r: 1 },
  { c: 4, r: 1 },
  { c: 5, r: 3 },
]
const PLANT = { c: 5, r: 1 }
const PEOPLE = [
  { c: 2, r: 1, shirt: "#4a7ec4", hair: "#2b2018", talking: true },
  { c: 4, r: 2, shirt: "#8a6fb0", hair: "#6b4423", talking: false },
  { c: 1, r: 3, shirt: "#c98a3c", hair: "#1f1b18", talking: false },
]
/** Anda pela fileira da frente, onde nada fica à frente dele. */
const WALK = [
  { c: 2, r: 4 },
  { c: 3, r: 3.6 },
  { c: 4, r: 4 },
  { c: 3, r: 3.6 },
]

// ── Avatar ───────────────────────────────────────────────────────────────────

/** No mundo o sprite tem 32px de altura contra 48 de parede — 2/3. */
const S = (WALL_H * (2 / 3)) / 32
const sx = (v: number) => (v - 8) * S
const sy = (v: number) => (v - 32) * S

function Part({
  x,
  y,
  w,
  h,
  fill,
  shade,
}: {
  x: number
  y: number
  w: number
  h: number
  fill: string
  /** Sombra fria de 1px na direita — a regra de 2 tons por superfície. */
  shade?: string
}) {
  return (
    <>
      <rect
        x={sx(x)}
        y={sy(y)}
        width={w * S}
        height={h * S}
        fill={fill}
        stroke={C.ink}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {shade && (
        <rect x={sx(x + w - 1)} y={sy(y)} width={S} height={h * S} fill={shade} />
      )}
    </>
  )
}

function PixelAvatar({
  shirt,
  hair,
  skin = "#e0aa7d",
}: {
  shirt: string
  hair: string
  skin?: string
}) {
  const skinD = "#c48c62"
  return (
    <>
      <ellipse cx={0} cy={0} rx={10} ry={4} fill="#000000" fillOpacity={0.26} />
      {/* Cada peça com contorno próprio: uma silhueta única fecharia o vão
          entre as pernas e o pescoço de 2px, e sem esses dois recortes o
          boneco lê como poste. */}
      <Part x={5} y={30} w={3} h={2} fill="#4a3526" />
      <Part x={9} y={30} w={3} h={2} fill="#3d2b1f" />
      <Part x={5} y={24} w={3} h={6} fill="#46505f" />
      <Part x={9} y={24} w={3} h={6} fill="#39424f" />
      <Part x={4} y={14} w={8} h={10} fill={shirt} shade="#00000033" />
      <Part x={7} y={13} w={2} h={2} fill={skinD} />
      <Part x={4} y={6} w={8} h={8} fill={skin} shade={skinD} />
      {/* O cabelo pode passar 1px de cada lado — é o que faz a cabeça ler
          mais larga que o tronco. */}
      <Part x={3} y={2} w={10} h={4} fill={hair} />
      <rect x={sx(3)} y={sy(2)} width={10 * S} height={S} fill="#ffffff" fillOpacity={0.18} />
      <rect x={sx(5.5)} y={sy(9)} width={S} height={S * 1.5} fill={C.ink} />
      <rect x={sx(9.5)} y={sy(9)} width={S} height={S * 1.5} fill={C.ink} />
    </>
  )
}

// ── Peças do cenário ─────────────────────────────────────────────────────────

/** Bloco de parede: duas faces verticais + tampa, como `drawIsoBlock`. */
function WallBlock({ c, r }: { c: number; r: number }) {
  const { x, y } = iso(c, r)
  const H = WALL_H
  const elevator = c === ELEVATOR.c && r === ELEVATOR.r
  // Boiserie ocupa a metade de baixo da face, como no tile da parede.
  const skirt = H * 0.34

  return (
    <>
      {/* Face esquerda (W-S) — a que fica na sombra. */}
      <polygon
        points={`${x - TW / 2},${y - H} ${x},${y - H + TH / 2} ${x},${y + TH / 2} ${x - TW / 2},${y}`}
        fill={elevator ? C.metalDark : C.wallShade}
      />
      {!elevator && (
        <polygon
          points={`${x - TW / 2},${y - skirt} ${x},${y - skirt + TH / 2} ${x},${y + TH / 2} ${x - TW / 2},${y}`}
          fill={C.wainscotDark}
        />
      )}
      {/* Face direita (E-S) — a que pega a luz. */}
      <polygon
        points={`${x},${y - H + TH / 2} ${x + TW / 2},${y - H} ${x + TW / 2},${y} ${x},${y + TH / 2}`}
        fill={elevator ? C.steel : C.wall}
      />
      {!elevator && (
        <polygon
          points={`${x},${y - skirt + TH / 2} ${x + TW / 2},${y - skirt} ${x + TW / 2},${y} ${x},${y + TH / 2}`}
          fill={C.wainscot}
        />
      )}
      {/* Tampa: no bake ela usa o tile WALL_TOP, bem mais escuro que a face —
          é esse contraste que faz a parede ler com espessura. */}
      <polygon points={diamond(c, r, H)} fill={C.wallTop} />

      {elevator && (
        <>
          {/* Junta central das duas folhas + indicador de andar aceso. */}
          <line
            x1={x}
            y1={y - H + TH / 2}
            x2={x}
            y2={y + TH / 2}
          />
          <line
            x1={x}
            y1={y - H + TH / 2}
            x2={x}
            y2={y + TH / 2}
            stroke={C.ink}
            strokeOpacity={0.45}
            strokeWidth={1.5}
          />
          <rect x={x + 6} y={y - H + 16} width={16} height={5} rx={1} fill="#2f363d" />
          <rect x={x + 11} y={y - H + 17} width={6} height={3} fill={C.indicator} />
        </>
      )}
    </>
  )
}

function Desk({ c, r }: { c: number; r: number }) {
  const p = iso(c, r)
  const H = 14
  const tw = TW / 2 - 8
  const th = TH / 2 - 4
  const top = p.y - H
  return (
    <>
      <polygon
        points={`${p.x - tw},${top} ${p.x},${top + th} ${p.x},${p.y + th} ${p.x - tw},${p.y}`}
        fill={C.woodDark}
        stroke={C.ink}
        strokeWidth={0.7}
      />
      <polygon
        points={`${p.x},${top + th} ${p.x + tw},${top} ${p.x + tw},${p.y} ${p.x},${p.y + th}`}
        fill={C.woodSeam}
        stroke={C.ink}
        strokeWidth={0.7}
      />
      <polygon
        points={`${p.x},${top - th} ${p.x + tw},${top} ${p.x},${top + th} ${p.x - tw},${top}`}
        fill={C.wood}
        stroke={C.ink}
        strokeWidth={0.7}
      />
      {/* Monitor assentado no tampo. */}
      <rect
        x={p.x - 8}
        y={top - 14}
        width={16}
        height={12}
        rx={1}
        fill="#2f363d"
        stroke={C.ink}
        strokeWidth={0.7}
      />
      <rect x={p.x - 6} y={top - 12} width={12} height={8} fill="#7fb0e8" />
    </>
  )
}

function Plant({ c, r }: { c: number; r: number }) {
  const p = iso(c, r)
  return (
    <>
      <rect
        x={p.x - 6}
        y={p.y - 11}
        width={12}
        height={11}
        rx={1}
        fill={C.wainscot}
        stroke={C.ink}
        strokeWidth={0.7}
      />
      <ellipse cx={p.x} cy={p.y - 18} rx={10} ry={9} fill={C.plant} stroke={C.ink} strokeWidth={0.7} />
      <ellipse cx={p.x - 3} cy={p.y - 21} rx={4} ry={3.5} fill={C.plantDark} />
    </>
  )
}

function Person({
  person,
  index,
  still,
}: {
  person: (typeof PEOPLE)[number]
  index: number
  still: boolean
}) {
  const pos = iso(person.c, person.r)
  return (
    <motion.g
      style={{ x: pos.x, y: pos.y }}
      animate={still ? undefined : { y: [pos.y, pos.y - 2, pos.y] }}
      transition={{
        duration: 2.8,
        repeat: Infinity,
        delay: index * 0.45,
        ease: "easeInOut",
      }}
    >
      <PixelAvatar shirt={person.shirt} hair={person.hair} />
      {person.talking && !still && (
        <motion.g
          animate={{ opacity: [0, 1, 1, 0], y: [-62, -66, -66, -70] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <rect
            x={-38}
            y={-8}
            width={28}
            height={15}
            rx={4}
            fill="#f4efe2"
            stroke={C.ink}
            strokeWidth={1}
          />
          {[-31, -24, -17].map((cx) => (
            <circle key={cx} cx={cx} cy={-0.5} r={1.8} fill={C.ink} />
          ))}
        </motion.g>
      )}
    </motion.g>
  )
}

function OfficeVisual({ still }: { still: boolean }) {
  const walk = WALK.map((p) => iso(p.c, p.r))

  const walls: { c: number; r: number }[] = []
  const floors: { c: number; r: number }[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      ;(isWall(c, r) ? walls : floors).push({ c, r })
    }
  }
  // Mesmo critério do bake: profundidade = coluna + linha.
  walls.sort((a, b) => a.c + a.r - (b.c + b.r))

  const props = [
    ...OFFICE_DESKS.map((d, i) => ({
      depth: d.c + d.r,
      key: `desk-${i}`,
      delay: 0.3 + i * 0.06,
      node: <Desk c={d.c} r={d.r} />,
    })),
    {
      depth: PLANT.c + PLANT.r,
      key: "plant",
      delay: 0.44,
      node: <Plant c={PLANT.c} r={PLANT.r} />,
    },
    ...PEOPLE.map((pp, i) => ({
      depth: pp.c + pp.r,
      key: `person-${i}`,
      delay: 0.5 + i * 0.09,
      node: <Person person={pp} index={i} still={still} />,
    })),
  ].sort((a, b) => a.depth - b.depth)

  return (
    <div className="flex h-full w-full items-center justify-center">
      {/* viewBox colado nos limites reais da sala. Sobra em volta vira palco
            vazio e faz o cômodo parecer pequeno sem motivo. */}
      <svg viewBox="168 0 368 292" className="h-full w-auto max-w-full" aria-hidden="true">
        <g>
          {/* Paredes norte e oeste */}
          {walls.map((w) => (
            <motion.g
              key={`w-${w.c}-${w.r}`}
              initial={still ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: (w.c + w.r) * 0.03, ease: EASE }}
            >
              <WallBlock c={w.c} r={w.r} />
            </motion.g>
          ))}

          {/* Piso */}
          {floors.map((f) => {
            const carpet = CARPET.has(`${f.c},${f.r}`)
            const alt = (f.c + f.r) % 2 === 0
            return (
              <motion.polygon
                key={`f-${f.c}-${f.r}`}
                points={diamond(f.c, f.r)}
                fill={
                  carpet
                    ? alt
                      ? C.carpet
                      : C.carpetDark
                    : alt
                      ? C.wood
                      : C.woodDark
                }
                stroke={carpet ? C.carpetDark : C.woodSeam}
                strokeWidth={0.7}
                initial={still ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: 0.3,
                  delay: 0.1 + (f.c + f.r) * 0.025,
                  ease: EASE,
                }}
              />
            )
          })}

          {/* Móveis e pessoas, do fundo para a frente */}
          {props.map((e) => (
            <motion.g
              key={e.key}
              initial={still ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.32, delay: e.delay, ease: EASE }}
            >
              {e.node}
            </motion.g>
          ))}

          {/* Quem está andando — é isso que separa o escritório de um diagrama. */}
          <motion.g
            initial={still ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.32, delay: 0.8, ease: EASE }}
          >
            <motion.g
              style={{ x: walk[0].x, y: walk[0].y }}
              animate={
                still ? undefined : { x: walk.map((w) => w.x), y: walk.map((w) => w.y) }
              }
              transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <PixelAvatar shirt="#5aa06d" hair="#3a2418" skin="#c98f66" />
            </motion.g>
          </motion.g>
        </g>
      </svg>
    </div>
  )
}
