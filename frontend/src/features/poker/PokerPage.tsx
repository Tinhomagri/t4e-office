// Sala de Planning Poker — mesa oval com assentos ao redor, votação fibonacci,
// fila de cards do host e estatísticas da rodada. Tema escuro próprio da sala.
import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AvatarCanvas } from "@/features/avatar/AvatarCanvas"
import { randomAvatar } from "@/features/avatar/avatar.random"
import type { Direction } from "@/features/avatar/avatar.types"
import { saveAvatarConfig } from "@/features/office/office.api"
import {
  BarChart3,
  Check,
  CheckCircle2,
  LogOut,
  ChevronDown,
  Eye,
  Link2,
  ListOrdered,
  Mic,
  MicOff,
  Radio,
  Search,
  SkipForward,
  Sparkles,
  Spade,
  Video,
  VideoOff,
} from "lucide-react"
import { joinPokerRoom, type JoinResult } from "@/features/meetings/meetings.api"
import { mediaErrorMessage, type MediaKind } from "@/features/meetings/MediaSync"
import { toast as notify } from "@/shared/ui/toast"
import { MockVideoTiles, PokerVideoOverlay } from "./PokerVideoOverlay"
import { isMockSeat, makeMockParticipants, mockSeatCount } from "./poker.mockSeats"
import { SEATS_MAX, fitScale, seatLayout, tableSize, wrapperMargins } from "./poker.layout"
import { useAuthStore } from "@/features/auth/auth.store"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { useProjects } from "@/features/workspace/workspace.hooks"
import {
  useCreateSquadSession,
  useSquads,
  useSession,
  usePokerCards,
  useHeartbeat,
  useLeaveSession,
  useCreateSession,
  useJoinSession,
  useSubmitVote,
  useUpdateSession,
  useApplyPoints,
  useRounds,
  usePokerSummary,
  useSendReaction,
  useSendEmote,
} from "./poker.hooks"
import { FIBONACCI, POKER_EMOTES, REACTION_EMOJIS, type Squad } from "./poker.types"
import type { PokerParticipant, PokerCard, PokerSession } from "./poker.types"

// Paleta da sala. Os valores vêm do tailwind.config do projeto (escalas `ink`,
// `neutral`, `blue`, `green`) — a sala é escura porque carta virada precisa de
// contraste, não porque é um produto à parte. Existe como objeto, e não como
// classe Tailwind, só porque boa parte disso entra em `style` (gradiente da
// mesa, sombras, rgba) onde classe não serve.
const P = {
  bg: "#0A0B0D",
  panel: "#212328",
  panelSoft: "#17191E",
  border: "#2E3036",
  borderSoft: "#212328",
  text: "#F7F8F9",
  textSoft: "#B3B9C4",
  textDim: "#8590A2",
  accent: "#0C66E4",
  accentSoft: "#579DFF",
}

// Valores numéricos do deck (sem o "?") — estatísticas e seletor de pontuação final.
const DECK_NUMBERS = FIBONACCI.map(Number).filter((n) => !isNaN(n))

// Rótulo falado do voto — "?" e "☕" não se leem sozinhos.
function voteLabel(value: string): string {
  if (value === "?") return "não sei estimar"
  if (value === "☕") return "preciso de uma pausa"
  return `peso ${value}`
}

function cx(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(" ")
}

// ─── Estatísticas da rodada revelada ────────────────────────────────────────

interface RoundStats {
  avg: number
  median: number
  min: number
  max: number
  consensus: boolean
  distribution: { value: string; count: number }[]
}

function computeStats(votes: PokerSession["votes"]): RoundStats | null {
  const cast = votes.filter((v) => v.has_voted)
  if (cast.length === 0) return null

  const distMap = new Map<string, number>()
  for (const v of cast) {
    const key = v.value ?? "?"
    distMap.set(key, (distMap.get(key) ?? 0) + 1)
  }
  const distribution = [...distMap.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (isNaN(Number(a.value)) ? 1 : Number(a.value)) - (isNaN(Number(b.value)) ? 1 : Number(b.value)))

  const nums = cast.map((v) => parseFloat(v.value ?? "")).filter((n) => !isNaN(n))
  if (nums.length === 0) {
    return { avg: 0, median: 0, min: 0, max: 0, consensus: false, distribution }
  }
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length
  const allSame = nums.every((n) => n === nums[0])
  const consensus = allSame && nums.length === cast.length

  return { avg, median, min: Math.min(...sorted), max: Math.max(...sorted), consensus, distribution }
}

// ─── Assento: carta + avatar + nome, fora da borda da mesa ──────────────────

// Assento: 80px de largura por ~114 de altura. As margens negativas centram o
// bloco no ponto da órbita sem usar `translate(-50%,-50%)`, que brigaria com o
// x/y do framer-motion (os dois escrevem no mesmo `transform`).
const SEAT_W = 96
// Escala 3 (48×96 antes do recorte). Sempre inteira: fracionária faz colunas
// de pixel com larguras diferentes e o sprite "ondula".
const SPRITE_SCALE = 3
// O sprite é um corpo em pé (pernas em y24..31 do frame 16×32) e o chibi.ts não
// tem pose sentada. Em vez de desenhar arte nova — que o Escritório também usa
// —, o assento recorta o sprite na altura do tronco e uma borda de mesa cobre a
// emenda: lê como alguém sentado apoiado na mesa, sem tocar no spritesheet.
const BODY_VISIBLE_ROWS = 24          // mostra até o quadril (y0..23)
const BODY_H = BODY_VISIBLE_ROWS * SPRITE_SCALE
const TABLE_EDGE_H = 10               // faixa que cobre a linha do corte
const SEAT_H = 150

// Estado da rodada → animação do sprite. É o que faz a mesa ser legível de
// relance: dá para ver quem ainda está pensando sem ler uma linha de texto.
export function seatAnim(opts: {
  voting: boolean
  revealed: boolean
  hasVoted: boolean
  cheering: boolean
  throwing: boolean
  justRevealed: boolean
  emote?: string | null
}): string {
  // Emote é o único gesto que a pessoa pediu explicitamente — vence o resto.
  if (opts.emote) return opts.emote
  // Arremessar vem depois: é a ação que ela está fazendo agora, e sem
  // prioridade o gesto sumiria embaixo do estado da rodada.
  if (opts.throwing) return "punch"
  if (opts.cheering) return "wave"          // acabou de receber uma reação
  // Comemorar é um instante, não um estado. `revealed` dura até o host aplicar
  // o peso — amarrar `celebrate` nele deixava todo mundo pulando sem parar.
  if (opts.justRevealed) return "celebrate"
  if (opts.revealed) return "lean"
  if (opts.voting) return "lean"  // votou ou pensando — parado, sem "idle" bobbing (a pedido)
  return "idle"
}

// Todo mundo olha para a mesa: quem senta em cima olha para baixo, quem senta
// embaixo olha para cima, e as laterais viram para dentro.
export function seatFacingAt(angle: number): Direction {
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  // Quem manda é o eixo dominante (corte em 45°), não um limiar fixo em `sin`.
  // Com o limiar antigo (0,35) os quatro assentos das laterais caíam em
  // |sin| ≈ 0,38 e olhavam para cima/baixo, mesmo com |cos| ≈ 0,92 — de costas
  // para a mesa em vez de virados para ela.
  if (Math.abs(sin) >= Math.abs(cos)) return sin < 0 ? "down" : "up"
  return cos > 0 ? "left" : "right"
}

/** Mesma regra a partir do índice, quando os assentos são igualmente angulares. */
export function seatFacing(index: number, total: number): Direction {
  return seatFacingAt((index / total) * 2 * Math.PI - Math.PI / 2)
}

function Seat({
  participant,
  hasVoted,
  voteValue,
  revealed,
  voting,
  index,
  x,
  y,
  canReact,
  onReact,
  cheering,
  throwing,
  facing,
  emote,
  onEmote,
}: {
  participant: PokerParticipant
  hasVoted: boolean
  voteValue: string | null
  revealed: boolean
  voting: boolean
  index: number
  x: number
  y: number
  canReact: boolean
  onReact: (emoji: string) => void
  cheering: boolean
  throwing: boolean
  facing: Direction
  emote: string | null
  /** Só no assento próprio: abre o menu de emotes. */
  onEmote?: (anim: string) => void
}) {
  const reduce = useReducedMotion()
  const [barOpen, setBarOpen] = useState(false)
  const [emoteOpen, setEmoteOpen] = useState(false)

  // O poll de 2s devolve um `avatar_config` novo a cada resposta. Sem congelar
  // a referência por valor, o AvatarCanvas remontava o spritesheet e reiniciava
  // o ciclo no frame 0 duas vezes por segundo — o sprite "resetava" sozinho.
  const avatarConfig = useMemo(
    () => participant.avatar_config ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(participant.avatar_config ?? null)],
  )

  // Dispara na virada para "revelado" e se apaga sozinho; depois disso a
  // pessoa fica apoiada na mesa esperando a próxima carta.
  const [justRevealed, setJustRevealed] = useState(false)
  useEffect(() => {
    if (!revealed) return
    setJustRevealed(true)
    const timer = window.setTimeout(() => setJustRevealed(false), CELEBRATE_MS)
    return () => clearTimeout(timer)
  }, [revealed])
  return (
    <motion.div
      // `transform`/`opacity` animados criam stacking context próprio: o menu
      // de reação (z-20 lá dentro) fica preso a este teto. Sem elevar o
      // ASSENTO inteiro quando o menu abre, a câmera (z-20 do overlay, MESMO
      // contexto do pai) sempre ganha por estar fora dessa jaula.
      className={`absolute left-1/2 top-1/2 ${barOpen || emoteOpen ? "z-30" : "z-10"}`}
      style={{ width: SEAT_W, marginLeft: -SEAT_W / 2, marginTop: -SEAT_H / 2 }}
      initial={{ x, y, scale: 0.6, opacity: 0 }}
      animate={{ x, y, scale: 1, opacity: 1 }}
      exit={{ scale: 0.85, opacity: 0 }}
      transition={
        reduce
          ? { duration: 0 }
          : {
              // Mola para o reposicionamento (a órbita inteira gira quando
              // alguém entra ou sai); tween curto para o fade de entrada/saída.
              x: { type: "spring", stiffness: 260, damping: 26 },
              y: { type: "spring", stiffness: 260, damping: 26 },
              scale: { type: "spring", stiffness: 400, damping: 22, delay: index * 0.04 },
              opacity: { duration: 0.2, ease: "easeOut" },
            }
      }
      onHoverStart={() => canReact && setBarOpen(true)}
      onHoverEnd={() => setBarOpen(false)}
      // Sem isto a barra só existiria no hover e o teclado nunca alcançaria as
      // reações — `focus-within` não serve porque os botões só são montados
      // depois de abrir. O botão-gatilho abaixo é o que recebe o foco primeiro.
      onFocusCapture={() => canReact && setBarOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setBarOpen(false)
          setEmoteOpen(false)
        }
      }}
    >
    {/* Ocupa a caixa inteira: com uma coluna mais estreita encostada à
        esquerda, o eixo visual do assento não era o ponto da órbita — e a
        câmera, ancorada nesse ponto, saía da vertical da carta. */}
    <div className="relative flex w-full flex-col items-center gap-1.5">
      {onEmote && (
        <EmoteMenu
          open={emoteOpen}
          onPick={(anim) => {
            onEmote(anim)
            setEmoteOpen(false)
          }}
        />
      )}
      {canReact && (
        <ReactionBar
          open={barOpen}
          targetName={participant.user_name.split(" ")[0]}
          onPick={(emoji) => {
            onReact(emoji)
            setBarOpen(false)
          }}
        />
      )}
      {/* Carta com flip 3D; revelação em cascata */}
      <div className="h-[52px] w-9" style={{ perspective: 400 }}>
        <div
          className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
          style={{
            transform: revealed && hasVoted ? "rotateY(180deg)" : "rotateY(0deg)",
            transitionDelay: revealed ? `${index * 120}ms` : "0ms",
          }}
        >
          <div
            className={cx(
              "absolute inset-0 flex items-center justify-center rounded-md border [backface-visibility:hidden] transition-colors duration-300",
              hasVoted
                ? "border-green-500/70 shadow-[0_0_10px_rgba(34,160,107,0.3)]"
                : "border-[#2E3036]",
              voting && !hasVoted && "poker-float",
            )}
            style={CARD_BACK_STYLE}
          >
            {/* Selo no verso: quem já votou tem a carta na mesa, virada. */}
            {hasVoted && (
              <span className="grid size-4 place-items-center rounded-full bg-green-500 text-[9px] font-bold text-white">
                ✓
              </span>
            )}
          </div>
          <div
            className="absolute inset-0 [backface-visibility:hidden]"
            style={{ transform: "rotateY(180deg)" }}
          >
            {voteValue ? (
              <CardFace value={voteValue} size="seat" />
            ) : (
              <span className="grid size-full place-items-center rounded-md border border-[#2E3036] bg-[#17191E] text-sm text-[#8590A2]">
                –
              </span>
            )}
          </div>
        </div>
      </div>
      {(() => {
        const avatarClass = cx(
          "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300",
          participant.is_host
            ? "border-[#0C66E4] bg-[#0C66E4]/20 text-[#579DFF]"
            : "border-[#2E3036] bg-[#212328] text-[#B3B9C4]",
          voting && !hasVoted && "poker-pulse",
        )
        // Quem já criou avatar senta como sprite; quem não criou continua nas
        // iniciais — cinco "Funcionário" idênticos na mesa seria pior que isso.
        const body = avatarConfig ? (
          <span
            className="relative block overflow-hidden"
            style={{ width: 16 * SPRITE_SCALE, height: BODY_H }}
          >
            <AvatarCanvas
              config={avatarConfig}
              anim={seatAnim({ voting, revealed, hasVoted, cheering, throwing, justRevealed, emote })}
              dir={facing}
              scale={SPRITE_SCALE}
              // Na mesa só anima o que é gesto (emote/reagir/comemorar); a
              // espera do voto fica em pose parada — o ciclo de idle/lean lia
              // como "braço balançando sem parar".
              frozen={!emote && !throwing && !cheering && !justRevealed}
            />
            {/* Borda da mesa: cobre a linha do corte e ancora a pessoa na
                madeira, senão o tronco pareceria cortado no ar. */}
            <span
              className="absolute inset-x-0 bottom-0 rounded-t-[2px]"
              style={{
                height: TABLE_EDGE_H,
                background: "linear-gradient(180deg, #2E3036, #17191E)",
                boxShadow: "0 -1px 0 rgba(255,255,255,0.06)",
              }}
              aria-hidden
            />
          </span>
        ) : (
          <span className={avatarClass}>{participant.avatar_initials}</span>
        )
        // O avatar de outra pessoa é o gatilho das reações; o próprio abre o
        // menu de emotes (ninguém reage para si).
        if (canReact) {
          return (
            <button
              type="button"
              onClick={() => setBarOpen((v) => !v)}
              aria-expanded={barOpen}
              aria-label={`Reagir para ${participant.user_name}`}
              className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4] focus-visible:outline-offset-2"
            >
              {body}
            </button>
          )
        }
        if (!onEmote) return body
        return (
          <span className="relative inline-flex">
            {body}
            <button
              type="button"
              onClick={() => setEmoteOpen((v) => !v)}
              aria-expanded={emoteOpen}
              aria-label="Emotes"
              className="absolute -right-2 -top-1 grid size-5 place-items-center rounded-full border text-[11px] leading-none text-[#B3B9C4] shadow transition-colors hover:bg-[#2E3036] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4]"
              style={{ borderColor: P.border, background: "rgba(33,35,40,0.97)" }}
            >
              ⋯
            </button>
          </span>
        )
      })()}
      <span className="max-w-[80px] truncate text-center text-[10px] font-medium leading-tight text-[#8590A2]">
        {participant.user_name.split(" ")[0]}
        {participant.is_host && <span className="ml-1 text-[#579DFF]" title="Host">★</span>}
      </span>
    </div>
    </motion.div>
  )
}

// Verso da carta: losangos diagonais em duas camadas, como baralho de
// verdade. `background-image` em gradiente repetido — nada de asset externo.
const CARD_BACK_STYLE: React.CSSProperties = {
  backgroundColor: "#17191E",
  backgroundImage:
    "repeating-linear-gradient(45deg, rgba(12,102,228,0.32) 0 3px, transparent 3px 7px)," +
    "repeating-linear-gradient(-45deg, rgba(12,102,228,0.32) 0 3px, transparent 3px 7px)",
}

// Frente da carta: índice nos dois cantos opostos e naipe no centro, que é o
// que faz o olho ler "carta" em vez de "botão com número".
function CardFace({
  value,
  size,
}: {
  value: string
  size: "seat" | "deck"
}) {
  const deck = size === "deck"
  return (
    <span
      className={cx(
        "flex size-full items-center justify-center rounded-md border border-[#B3B9C4] bg-white font-bold leading-none text-neutral-900",
        deck ? "text-2xl" : "text-base",
      )}
    >
      {value}
    </span>
  )
}

// ─── Reações entre participantes ─────────────────────────────────────────────

// Barra que abre no hover do assento alheio. Fica acima do assento e some ao
// escolher — reagir é um gesto de um clique, não um menu para navegar.
function ReactionBar({
  open,
  targetName,
  onPick,
}: {
  open: boolean
  targetName: string
  onPick: (emoji: string) => void
}) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="bar"
          className="absolute -top-9 z-20 flex gap-0.5 rounded-full border px-1.5 py-1 shadow-lg"
          style={{ borderColor: P.border, background: "rgba(33,35,40,0.97)" }}
          initial={{ opacity: 0, scale: 0.85, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={reduce ? { duration: 0 } : { duration: 0.16, ease: [0.2, 0, 0, 1] }}
          role="group"
          aria-label={`Reagir para ${targetName}`}
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onPick(emoji)}
              aria-label={`Enviar ${emoji} para ${targetName}`}
              className="grid size-6 place-items-center rounded-full text-sm transition-transform hover:scale-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4]"
            >
              {emoji}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Menu do próprio assento: escolher um emote para a sala inteira ver. Em
// grade porque são 8 opções com rótulo — a barra de emoji cabe numa linha, isto
// não.
function EmoteMenu({
  open,
  onPick,
}: {
  open: boolean
  onPick: (anim: string) => void
}) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="emotes"
          className="absolute -top-2 z-30 grid w-40 -translate-y-full grid-cols-4 gap-0.5 rounded-xl border p-1.5 shadow-xl"
          style={{ borderColor: P.border, background: "rgba(33,35,40,0.98)" }}
          initial={{ opacity: 0, scale: 0.9, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={reduce ? { duration: 0 } : { duration: 0.16, ease: [0.2, 0, 0, 1] }}
          role="group"
          aria-label="Escolher emote"
        >
          {POKER_EMOTES.map((e) => (
            <button
              key={e.anim}
              onClick={() => onPick(e.anim)}
              title={e.label}
              aria-label={e.label}
              className="grid size-8 place-items-center rounded-lg text-base transition-colors hover:bg-[#2E3036] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4]"
            >
              {e.icon}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Reação em voo: sai do assento de quem mandou, faz um arco por cima da mesa e
// pousa no assento de quem recebeu. É a única coisa na sala que liga duas
// pessoas visualmente — daí o arco em vez de uma linha reta.
// Tempo do gesto antes de a mão soltar o emoji. Bate com o frame do `punch`
// em que o braço termina de estender — soltar antes faz o emoji sair sozinho,
// depois faz o braço voltar de mão vazia.
export const THROW_WINDUP = 0.18
// Altura da mão dentro do assento: o tronco fica acima do centro por causa do
// recorte, então o emoji sai daí e não do meio do bloco.
const HAND_Y = 6
const FLIGHT_S = 0.95
// Duração do gesto: preparo + um ciclo de `punch` (4 frames a 10fps). Mais que
// isso e o braço soca repetido durante o voo inteiro.
export const THROW_GESTURE_MS = (THROW_WINDUP + 0.4) * 1000
// Instante em que o emoji encosta no alvo — 82% do voo, o keyframe do impacto.
export const IMPACT_MS = (THROW_WINDUP + FLIGHT_S * 0.82) * 1000
export const CHEER_MS = 800
// Duração de um emote na mesa. Alguns ciclos do clipe — o bastante para ler o
// gesto sem virar um loop permanente.
export const EMOTE_MS = 3200
// Duração da comemoração na revelação — um beat, não um estado.
export const CELEBRATE_MS = 1600

function FlyingReaction({
  emoji,
  from,
  to,
  onDone,
}: {
  emoji: string
  from: { x: number; y: number }
  to: { x: number; y: number }
  onDone: () => void
}) {
  const reduce = useReducedMotion()
  // Sai pelo lado do corpo virado para o alvo, na altura da mão.
  const originX = from.x + (to.x >= from.x ? 9 : -9)
  const originY = from.y + HAND_Y
  const midX = (originX + to.x) / 2
  const midY = (originY + to.y) / 2 - 70

  if (reduce) {
    // Sem movimento: pisca sobre o destinatário e sai. A informação (quem
    // recebeu o quê) continua chegando, só não atravessa a tela.
    return (
      <motion.span
        className="pointer-events-none absolute left-1/2 top-1/2 z-30 text-2xl"
        style={{ marginLeft: -12, marginTop: -12 }}
        initial={{ x: to.x, y: to.y, opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.2, times: [0, 0.15, 0.7, 1] }}
        onAnimationComplete={onDone}
        aria-hidden
      >
        {emoji}
      </motion.span>
    )
  }

  return (
    <motion.span
      className="pointer-events-none absolute left-1/2 top-1/2 z-30 text-2xl"
      style={{ marginLeft: -12, marginTop: -12 }}
      initial={{ x: originX, y: originY, scale: 0.4, opacity: 0 }}
      animate={{
        x: [originX, midX, to.x, to.x],
        y: [originY, midY, to.y, to.y],
        // O último passo é o impacto: estufa e some em cima da pessoa, em vez
        // de simplesmente apagar no ar.
        scale: [0.4, 1.4, 1.1, 1.7],
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        duration: FLIGHT_S,
        delay: THROW_WINDUP,
        ease: "easeOut",
        times: [0, 0.45, 0.82, 1],
      }}
      onAnimationComplete={onDone}
      aria-hidden
    >
      {emoji}
    </motion.span>
  )
}

// ─── Confete no consenso ─────────────────────────────────────────────────────

// Fita de papel do consenso. Trajetória balística por peça (sobe, abre em
// leque, cai) — o keyframe CSS antigo fazia todas descerem em paralelo, o que
// lia como chuva, não como comemoração.
const CONFETTI_COLORS = ["#0C66E4", "#579DFF", "#22A06B", "#E2B203", "#E56910"]
const CONFETTI = Array.from({ length: 18 }, (_, i) => {
  // Determinístico por índice: com Math.random() cada re-render sortearia
  // trajetórias novas e as peças saltariam no meio do voo.
  const spread = (i / 17 - 0.5) * 2 // -1 … 1
  return {
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    dx: spread * 150,
    rise: 60 + ((i * 37) % 50),
    rotate: spread * 420,
    delay: (i % 6) * 0.045,
    duration: 1.1 + ((i * 13) % 40) / 100,
  }
})

function ConfettiBurst() {
  const reduce = useReducedMotion()
  if (reduce) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center" aria-hidden>
      {CONFETTI.map((c, i) => (
        <motion.span
          key={i}
          className="absolute block h-2 w-1.5 rounded-[1px]"
          style={{ background: c.color }}
          initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
          animate={{
            x: [0, c.dx * 0.6, c.dx],
            y: [0, -c.rise, 120],
            rotate: [0, c.rotate * 0.5, c.rotate],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: c.duration,
            delay: c.delay,
            ease: "easeOut",
            opacity: { duration: c.duration, delay: c.delay, times: [0, 0.1, 0.6, 1] },
          }}
        />
      ))}
    </div>
  )
}

function RoundSummary({ stats }: { stats: RoundStats }) {
  const maxCount = Math.max(...stats.distribution.map((d) => d.count), 1)
  return (
    <div
      className={cx(
        "relative w-full rounded-xl border p-3 poker-pop",
        stats.consensus
          ? "border-green-500/40 shadow-[0_0_20px_rgba(34,160,107,0.15)]"
          : "border-[#2E3036]",
      )}
      style={{ background: P.panelSoft }}
    >
      {stats.consensus && <ConfettiBurst />}
      <div className="flex items-center justify-center gap-1.5 text-[#579DFF]">
        <Sparkles className="size-4" aria-hidden />
        <span className="text-2xl font-bold tabular-nums">{stats.avg.toFixed(1)}</span>
        <span className="text-[11px] text-[#8590A2]">média</span>
      </div>

      <div className="mt-2 flex justify-center gap-3 text-[11px] text-[#8590A2]">
        <span>mediana <b className="text-[#DCDFE4]">{stats.median}</b></span>
        <span>min <b className="text-[#DCDFE4]">{stats.min}</b></span>
        <span>max <b className="text-[#DCDFE4]">{stats.max}</b></span>
      </div>

      {stats.consensus ? (
        <div className="mt-2 flex items-center justify-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold text-green-400">
          <CheckCircle2 className="size-3" aria-hidden /> Consenso!
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[11px] font-semibold text-yellow-500">
          <BarChart3 className="size-3" aria-hidden /> Votos divergentes
        </div>
      )}

      <div className="mt-3 flex items-end justify-center gap-2">
        {stats.distribution.map((d) => (
          <div key={d.value} className="flex flex-col items-center gap-1">
            <div
              className="w-5 rounded-t bg-[#0C66E4]/70"
              style={{ height: `${Math.max((d.count / maxCount) * 28, 4)}px` }}
            />
            <span className="text-[10px] font-semibold text-[#DCDFE4]">{d.value}</span>
            <span className="text-[9px] text-[#8590A2]">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Centro da mesa: só o essencial (card atual + progresso) ─────────────────
// Estatísticas e ações do host vivem ABAIXO da mesa (RoundPanel) — o centro
// tem espaço limitado e não pode estourar a elipse.

function TableCenter({
  session,
  currentCard,
  isHost,
}: {
  session: PokerSession
  currentCard: PokerCard | null
  isHost: boolean
}) {
  if (session.status === "waiting") {
    return (
      <div className="flex max-w-[260px] flex-col items-center gap-3 px-6 text-center poker-pop">
        <div className="relative flex items-end" aria-hidden>
          {/* Leque de cartas decorativo */}
          {[-14, 0, 14].map((deg, i) => (
            <div
              key={deg}
              className="poker-float -mx-1.5 flex h-14 w-10 items-center justify-center rounded-lg border border-[#2E3036] bg-gradient-to-b from-[#212328] to-[#17191E] text-lg text-[#579DFF] shadow-lg"
              style={{ transform: `rotate(${deg}deg)`, animationDelay: `${i * 350}ms` }}
            >
              {i === 1 ? "♠" : "?"}
            </div>
          ))}
        </div>
        <p className="text-sm font-medium text-[#B3B9C4]">
          {isHost ? "Escolha um card na fila para começar" : "Aguardando o host iniciar…"}
        </p>
        {isHost && (
          <p className="text-xs text-[#8590A2]">
            Clique em <b className="text-[#579DFF]">Votar</b> no painel ao lado →
          </p>
        )}
      </div>
    )
  }

  if (session.status === "done") {
    return (
      <div className="poker-pop flex flex-col items-center gap-1 text-center">
        <CheckCircle2 className="size-8 text-green-400" aria-hidden />
        <p className="text-sm font-semibold text-[#F7F8F9]">Sessão concluída!</p>
        <p className="text-xs text-[#8590A2]">Todos os cards foram estimados.</p>
      </div>
    )
  }

  if (!currentCard) {
    return <p className="text-sm text-[#8590A2]">Nenhum card selecionado</p>
  }

  const votedCount = session.votes.filter((v) => v.has_voted).length
  const totalVoters = session.participants.length

  return (
    <div className="flex w-[240px] flex-col items-center gap-2.5">
      <div
        key={currentCard.id}
        className="w-full rounded-2xl border p-3.5 text-center poker-pop"
        style={{
          borderColor: P.border,
          background: "linear-gradient(160deg, #17191E, #17191E)",
          boxShadow: "0 8px 24px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <span className="inline-block rounded-full bg-[#0C66E4]/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#579DFF]">
          {currentCard.ref}
        </span>
        <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-[#F7F8F9]">
          {currentCard.title}
        </p>
      </div>

      {session.status === "voting" && (
        <div className="flex w-full flex-col items-center gap-1.5">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[#17191E]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#0C66E4] to-[#579DFF] transition-all duration-500"
              style={{ width: `${totalVoters > 0 ? (votedCount / totalVoters) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-[#8590A2] tabular-nums">
            {votedCount}/{totalVoters} votaram
          </span>
        </div>
      )}

      {session.status === "revealed" && (
        <span className="rounded-full bg-[#0C66E4]/15 px-3 py-1 text-[11px] font-semibold text-[#579DFF]">
          ✨ Votos revelados — veja abaixo
        </span>
      )}
    </div>
  )
}

// ─── Painel da rodada (abaixo da mesa): stats + ações do host ────────────────

// Progresso da votação — enquanto as cartas estão viradas para baixo, é a
// única pista de quanto falta. Sem isso o host revela no escuro.
function VoteProgress({ voted, total }: { voted: number; total: number }) {
  const reduce = useReducedMotion()
  const pct = total === 0 ? 0 : (voted / total) * 100
  const complete = voted === total && total > 0
  return (
    <div className="flex w-52 flex-col items-center gap-1.5">
      <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: P.borderSoft }}>
        <motion.div
          className="h-full origin-left rounded-full"
          style={{ background: complete ? "#22A06B" : P.accent }}
          initial={false}
          animate={{ scaleX: pct / 100 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 28 }}
        />
      </div>
      <p className="text-[10px] font-medium text-[#8590A2]" aria-live="polite">
        {complete ? "Todo mundo votou" : `${voted} de ${total} votaram`}
      </p>
    </div>
  )
}

function RoundPanel({
  session,
  isHost,
  onReveal,
  onNextCard,
  onApply,
  applying,
}: {
  session: PokerSession
  isHost: boolean
  onReveal: () => void
  onNextCard: () => void
  onApply: (points: number) => void
  applying: boolean
}) {
  const stats = useMemo(() => computeStats(session.votes), [session.votes])
  const [applyValue, setApplyValue] = useState<number | null>(null)

  useEffect(() => {
    if (session.status === "revealed" && stats?.consensus && DECK_NUMBERS.includes(stats.avg)) {
      setApplyValue(stats.avg)
    } else {
      setApplyValue(null)
    }
  }, [session.current_card_id, session.status]) // eslint-disable-line react-hooks/exhaustive-deps

  if (session.status === "voting" && isHost) {
    return (
      <button
        onClick={onReveal}
        className="flex items-center gap-1.5 rounded-lg bg-[#0C66E4] px-5 py-2 text-xs font-semibold text-white shadow-[0_0_16px_rgba(12,102,228,0.35)] transition-all hover:bg-[#0055CC] hover:shadow-[0_0_22px_rgba(12,102,228,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4] focus-visible:outline-offset-2"
      >
        <Eye className="size-3.5" aria-hidden /> Revelar votos
      </button>
    )
  }

  if (session.status !== "revealed") return null

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      {stats && <RoundSummary stats={stats} />}
      {isHost && (
        <div className="flex w-full flex-col items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8590A2]">Aplicar peso final</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {DECK_NUMBERS.map((n) => (
              <button
                key={n}
                onClick={() => setApplyValue(n)}
                aria-pressed={applyValue === n}
                className={cx(
                  "flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4]",
                  applyValue === n
                    ? "scale-110 border-[#0C66E4] bg-[#0C66E4] text-white shadow-[0_0_10px_rgba(12,102,228,0.5)]"
                    : "border-[#2E3036] bg-[#212328] text-[#B3B9C4] hover:border-[#0C66E4]",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled={applying || applyValue === null}
              onClick={() => applyValue !== null && onApply(applyValue)}
              className="flex items-center gap-1.5 rounded-md bg-[#0C66E4] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0055CC] disabled:opacity-40"
            >
              <Check className="size-3.5" aria-hidden /> Aplicar peso {applyValue ?? "…"}
            </button>
            <button
              onClick={onNextCard}
              className="flex items-center gap-1 text-[10px] text-[#8590A2] transition-colors hover:text-[#B3B9C4]"
            >
              <SkipForward className="size-3" aria-hidden /> pular sem aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Baralho do jogador ──────────────────────────────────────────────────────

function VotingRow({ myVote, onVote }: { myVote: string | null; onVote: (v: string) => void }) {
  const reduce = useReducedMotion()
  return (
    <div
      className="flex flex-wrap items-end justify-center gap-2"
      role="group"
      aria-label="Escolha seu voto"
    >
      {FIBONACCI.map((val, i) => {
        const active = myVote === val
        return (
          <motion.button
            key={val}
            onClick={() => onVote(val)}
            aria-pressed={active}
            aria-label={`Votar: ${voteLabel(val)}`}
            // A carta escolhida sobe e fica; as outras só respondem ao ponteiro.
            animate={{ y: active ? -14 : 0 }}
            whileHover={reduce ? undefined : { y: active ? -18 : -8 }}
            whileTap={{ scale: 0.96 }}
            transition={
              reduce
                ? { duration: 0 }
                : { type: "spring", stiffness: 420, damping: 26, delay: i * 0.02 }
            }
            className={cx(
              "poker-deal h-24 w-16 rounded-lg p-0 transition-shadow duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4] focus-visible:outline-offset-2",
              active
                ? "shadow-[0_12px_26px_rgba(12,102,228,0.5)] ring-2 ring-[#0C66E4]"
                : "shadow-[0_6px_14px_rgba(0,0,0,0.45)] hover:shadow-[0_10px_20px_rgba(12,102,228,0.3)]",
            )}
            style={{ animationDelay: `${i * 45}ms` }}
          >
            <CardFace value={val} size="deck" />
          </motion.button>
        )
      })}
    </div>
  )
}

// ─── Fila de cards (painel do host) ─────────────────────────────────────────

function CardSelector({
  cards,
  queueIds,
  currentCardId,
  onSelectCard,
  query,
  onQueryChange,
  projects,
  projectFilter,
  onProjectFilterChange,
}: {
  cards: PokerCard[]
  queueIds: string[]
  currentCardId: string | null
  onSelectCard: (id: string) => void
  query: string
  onQueryChange: (value: string) => void
  projects: { id: string; name: string }[]
  projectFilter: string
  onProjectFilterChange: (value: string) => void
}) {
  // Fila primeiro (na ordem da sessão), depois o resto do projeto.
  const inQueue = queueIds
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is PokerCard => !!c)
  const rest = cards.filter((c) => !queueIds.includes(c.id))
  const estimated = inQueue.filter((c) => c.points != null).length

  const renderItem = (card: PokerCard) => {
    const isCurrent = card.id === currentCardId
    const done = card.points != null
    return (
      <div
        key={card.id}
        className={cx(
          "flex items-center gap-2 rounded-lg border p-2 transition-all",
          isCurrent
            ? "border-[#0C66E4] bg-[#0C66E4]/10 shadow-[0_0_12px_rgba(12,102,228,0.15)]"
            : "border-[#212328] bg-[#17191E] hover:border-[#2E3036]",
          done && !isCurrent && "opacity-60",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-[#8590A2]">{card.ref}</span>
            {done && (
              <span className="rounded bg-green-500/15 px-1 text-[10px] font-semibold text-green-400">
                peso {card.points}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-[#B3B9C4]">{card.title}</p>
        </div>
        <button
          onClick={() => onSelectCard(card.id)}
          disabled={isCurrent}
          className={cx(
            "shrink-0 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4]",
            isCurrent
              ? "cursor-default bg-[#0C66E4] text-white"
              : "bg-[#2E303600] border border-[#2E3036] text-[#B3B9C4] hover:border-[#0C66E4] hover:bg-[#0C66E4] hover:text-white",
          )}
        >
          {isCurrent ? "Votando" : "Votar"}
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <ListOrdered className="size-4 text-[#579DFF]" aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#B3B9C4]">Fila de votação</h3>
      </div>

      {/* Restringe a fila a um projeto sem precisar criar outra sala — vazio
          volta a buscar cards do workspace inteiro, igual antes. */}
      <select
        value={projectFilter}
        onChange={(e) => onProjectFilterChange(e.target.value)}
        className="mb-2 w-full rounded-lg border border-[#2E3036] bg-[#17191E] px-2 py-1.5 text-xs text-[#F7F8F9] outline-none focus:border-[#0C66E4]"
      >
        <option value="">Todos os projetos</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      {/* A sessão da squad enxerga os cards de todos os projetos: sem busca,
          achar um card específico seria rolar milhares. A consulta vai ao
          servidor — filtrar no cliente pegaria só a fatia já carregada. */}
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#8590A2]" aria-hidden />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Buscar card por título ou número"
          className="w-full rounded-lg border border-[#2E3036] bg-[#17191E] py-1.5 pl-8 pr-2 text-xs text-[#F7F8F9] outline-none placeholder:text-[#8590A2] focus:border-[#0C66E4]"
        />
      </div>

      {inQueue.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[10px] text-[#8590A2]">
            <span>{estimated} de {inQueue.length} estimados</span>
            <span className="tabular-nums">{inQueue.length > 0 ? Math.round((estimated / inQueue.length) * 100) : 0}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-[#17191E]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
              style={{ width: `${inQueue.length > 0 ? (estimated / inQueue.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 scrollbar-slim-dark">
        {inQueue.map(renderItem)}
        {rest.length > 0 && (
          <>
            <p className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-[#494B52]">
              Outros cards do projeto
            </p>
            {rest.map(renderItem)}
          </>
        )}
        {cards.length === 0 && (
          <p className="pt-4 text-center text-xs text-[#494B52]">Nenhum card no projeto</p>
        )}
      </div>
    </div>
  )
}

// ─── Criação/listagem de sessões ─────────────────────────────────────────────

function NewSessionModal({
  projects,
  squads,
  onClose,
  onCreate,
  onCreateForSquad,
}: {
  projects: { id: string; name: string; key: string }[]
  squads: Squad[]
  onClose: () => void
  onCreate: (projectId: string, name: string) => Promise<void>
  onCreateForSquad: (squadId: string, name: string) => Promise<void>
}) {
  // Squad é o caminho normal: o time se reúne uma vez e estima o que precisar,
  // de qualquer projeto. "Um projeto só" continua existindo para quem abre a
  // sala a partir de um board específico.
  const [modo, setModo] = useState<"squad" | "projeto">(squads.length ? "squad" : "projeto")
  const [squadId, setSquadId] = useState(squads[0]?.id ?? "")
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "")
  const [name, setName] = useState("Planning Poker")
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    setLoading(true)
    if (modo === "squad") await onCreateForSquad(squadId, name)
    else await onCreate(projectId, name)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="poker-pop w-full max-w-md rounded-2xl border p-6 shadow-2xl" style={{ borderColor: P.border, background: P.panel }}>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#F7F8F9]">
          <Spade className="size-5 text-[#579DFF]" aria-hidden /> Nova sessão de Planning Poker
        </h2>
        <div className="space-y-3">
          <div className="flex gap-1 rounded-lg border border-[#2E3036] bg-[#17191E] p-1">
            {(["squad", "projeto"] as const).map((opcao) => (
              <button
                key={opcao}
                onClick={() => setModo(opcao)}
                disabled={opcao === "squad" && squads.length === 0}
                className={cx(
                  "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                  modo === opcao
                    ? "bg-[#0C66E4] text-white"
                    : "text-[#8590A2] hover:text-[#F7F8F9]",
                )}
              >
                {opcao === "squad" ? "Por squad" : "Por projeto"}
              </button>
            ))}
          </div>

          {modo === "squad" ? (
            <div>
              <label className="mb-1 block text-xs text-[#8590A2]">Squad</label>
              {squads.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[#2E3036] px-3 py-2 text-xs text-[#8590A2]">
                  Nenhuma squad cadastrada ainda. Crie uma em Pessoas → Squads.
                </p>
              ) : (
                <select
                  value={squadId}
                  onChange={(e) => setSquadId(e.target.value)}
                  className="w-full rounded-lg border border-[#2E3036] bg-[#212328] px-3 py-2 text-sm text-[#F7F8F9] outline-none focus:border-[#0C66E4]"
                >
                  {squads.map((sq) => (
                    <option key={sq.id} value={sq.id}>{sq.name}</option>
                  ))}
                </select>
              )}
              <p className="mt-1.5 text-[11px] text-[#8590A2]">
                A sessão pontua cards de qualquer projeto — sem abrir uma sala por projeto.
              </p>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs text-[#8590A2]">Projeto</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-lg border border-[#2E3036] bg-[#212328] px-3 py-2 text-sm text-[#F7F8F9] outline-none focus:border-[#0C66E4]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>[{p.key}] {p.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-[#8590A2]">Nome da sessão</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[#2E3036] bg-[#212328] px-3 py-2 text-sm text-[#F7F8F9] outline-none focus:border-[#0C66E4]"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#8590A2] transition-colors hover:text-[#F7F8F9]">
            Cancelar
          </button>
          <button
            disabled={loading || (modo === "squad" ? !squadId : !projectId)}
            onClick={handleCreate}
            className="rounded-lg bg-[#0C66E4] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0055CC] disabled:opacity-40"
          >
            {loading ? "Criando…" : "Criar sala"}
          </button>
        </div>
      </div>
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  waiting: "Aguardando", voting: "Votando", revealed: "Revelando", done: "Concluída",
}
const STATUS_TONE: Record<string, string> = {
  waiting: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  voting: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-500",
  revealed: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  done: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

// Linha de rodada dentro do card expandido de histórico — o que foi votado
// num card específico, quem votou o quê, e a pontuação final aplicada.
function RoundRow({ round }: { round: import("./poker.types").PokerRound }) {
  const cast = round.votes.filter((v) => v.value != null)
  return (
    <div className="rounded-lg border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-800/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-mono text-[10px] text-paper-400">{round.card_ref}</span>{" "}
          <span className="text-sm font-medium text-ink dark:text-paper">{round.card_title}</span>
        </div>
        <span className="shrink-0 rounded-full bg-[#0C66E4]/10 px-2.5 py-1 text-xs font-bold text-[#0C66E4]">
          peso {round.final_points}
        </span>
      </div>
      {cast.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {cast.map((v, i) => (
            <span
              key={i}
              className="rounded-md border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-1.5 py-0.5 text-[11px] text-paper-500"
              title={v.participant_name}
            >
              {v.participant_name.split(" ")[0]}: <strong className="text-ink dark:text-paper">{v.value}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// Card de histórico expansível — carrega as rodadas (o que foi votado) sob
// demanda, só quando o usuário abre, para não pesar a lista inteira.
function SessionHistoryCard({
  session,
  projectLabel,
  onEnter,
}: {
  session: PokerSession
  projectLabel: string
  onEnter: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { data: rounds, isLoading } = useRounds(expanded ? session.id : null)

  return (
    <motion.div
      variants={ITEM_IN}
      layout="position"
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="rounded-xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 transition-colors hover:border-brand-300"
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-ink dark:text-paper">{session.name}</p>
            <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_TONE[session.status])}>
              {STATUS_LABEL[session.status]}
            </span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-paper-400">
            <span>{projectLabel}</span>
            <span>{fmtDateTime(session.created_at)}</span>
            <span>{session.rounds_count ?? 0} card{session.rounds_count === 1 ? "" : "s"} votado{session.rounds_count === 1 ? "" : "s"}</span>
            {session.avg_points != null && <span>peso médio {session.avg_points}</span>}
            <span>{session.participants_count ?? 0} participante{session.participants_count === 1 ? "" : "s"}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onEnter() }}
            className="rounded-lg bg-[#0C66E4] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#0055CC]"
          >
            {session.status === "done" ? "Ver sala" : "Entrar"}
          </button>
          <ChevronDown className={cx("size-4 text-paper-400 transition-transform", expanded && "rotate-180")} />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="rounds"
            className="space-y-2 overflow-hidden border-t border-paper-100 dark:border-ink-800 p-4 pt-3"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {isLoading && <p className="text-xs text-paper-400">Carregando…</p>}
            {!isLoading && (rounds ?? []).length === 0 && (
              <p className="text-xs text-paper-400">Nenhum card foi votado até agora nesta sala.</p>
            )}
            {(rounds ?? []).map((r) => <RoundRow key={r.id} round={r} />)}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// Avatar com gradiente determinístico pelo nome — mesma técnica usada no
// resto do app (board.shared.avatarGradient), reimplementada aqui para
// manter a feature de poker autocontida.
// Só escalas que existem no tailwind.config do projeto — violeta/teal/rosa do
// Tailwind padrão eram justamente o que fazia a tela parecer de outro produto.
const AVATAR_GRADIENTS = [
  "from-blue-400 to-blue-600",
  "from-green-400 to-green-600",
  "from-orange-400 to-orange-700",
  "from-red-400 to-red-600",
  "from-yellow-500 to-orange-700",
  "from-blue-300 to-blue-500",
]
function avatarGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}
function NameAvatar({ name }: { name: string }) {
  const init = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
  return (
    <span className={cx("grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[9px] font-semibold text-white ring-1 ring-inset ring-white/20", avatarGradient(name))}>
      {init}
    </span>
  )
}

// ─── Movimento do lobby ──────────────────────────────────────────────────────

// Entrada em cascata. Um container só orquestra: os filhos herdam as variantes
// do pai, então não é preciso repetir delay item a item.
const LIST_IN = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}
const ITEM_IN = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } },
}

// Número que sobe de 0 até o valor. Só para os contadores do resumo: eles
// aparecem uma vez por visita, que é onde uma animação de 700ms se paga.
function useCountUp(target: number, enabled: boolean): number {
  const [value, setValue] = useState(enabled ? 0 : target)
  useEffect(() => {
    if (!enabled) {
      setValue(target)
      return
    }
    let frame = 0
    const start = performance.now()
    const DURATION = 700
    const tick = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1)
      // easeOutCubic: chega rápido e assenta, em vez de arrastar até o fim.
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, enabled])
  return value
}

function MetricValue({ value }: { value: React.ReactNode }) {
  const reduce = useReducedMotion()
  const numeric = typeof value === "number" ? value : null
  const shown = useCountUp(numeric ?? 0, !reduce && numeric !== null)
  return <>{numeric === null ? value : shown}</>
}

function MetricTile({ icon, iconTone, accent, value, label }: { icon: React.ReactNode; iconTone: string; accent: string; value: React.ReactNode; label: string }) {
  return (
    <motion.div
      variants={ITEM_IN}
      className="relative overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-4 shadow-card"
    >
      <span className={cx("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", accent)} />
      <div className="flex items-center gap-2.5">
        <span className={cx("grid size-8 place-items-center rounded-xl", iconTone)}>{icon}</span>
        <span className="text-2xl font-bold tabular text-ink dark:text-paper">
          <MetricValue value={value} />
        </span>
      </div>
      <p className="mt-2 text-xs font-medium text-paper-500">{label}</p>
    </motion.div>
  )
}

// ─── Aba Resumo do Planning Poker — estilo Jira, agregando TODAS as sessões
// do workspace: quanto foi votado, distribuição de peso, quem mais votou
// e a atividade recente entre salas. ───────────────────────────────────────
function PokerResumoDashboard({ workspaceId }: { workspaceId: string }) {
  const { data: summary } = usePokerSummary(workspaceId)
  if (!summary) return null

  const maxDist = Math.max(1, ...summary.points_distribution.map((d) => d.count))
  const maxVotes = Math.max(1, ...summary.top_estimators.map((e) => e.votes))

  return (
    <div className="space-y-5">
      <motion.div
        variants={LIST_IN}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 lg:grid-cols-5"
      >
        <MetricTile
          icon={<Sparkles className="size-4" />}
          iconTone="bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300"
          accent="from-blue-500 to-blue-300"
          value={summary.sessions_total}
          label="sessões no total"
        />
        <MetricTile
          icon={<Radio className="size-4" />}
          iconTone="bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-500"
          accent="from-yellow-500 to-orange-400"
          value={summary.sessions_active}
          label="salas em andamento"
        />
        <MetricTile
          icon={<ListOrdered className="size-4" />}
          iconTone="bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
          accent="from-blue-600 to-blue-400"
          value={summary.rounds_total}
          label="cards estimados no total"
        />
        <MetricTile
          icon={<CheckCircle2 className="size-4" />}
          iconTone="bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400"
          accent="from-green-500 to-green-400"
          value={summary.rounds_today}
          label="cards votados hoje"
        />
        <MetricTile
          icon={<BarChart3 className="size-4" />}
          iconTone="bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400"
          accent="from-orange-500 to-yellow-500"
          value={summary.avg_points ?? "—"}
          label="peso médio"
        />
      </motion.div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Distribuição de peso votado */}
        <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
          <p className="text-sm font-semibold text-ink dark:text-paper">Distribuição de peso</p>
          <p className="mt-0.5 text-xs text-paper-400">Quantas vezes cada valor do deck virou o peso final.</p>
          <div className="mt-6 flex h-36 items-end gap-3">
            {summary.points_distribution.map((d) => (
              <div key={d.points} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-semibold text-ink dark:text-paper">{d.count || ""}</span>
                <div className="flex h-28 w-full items-end">
                  <motion.div
                    className="w-full origin-bottom rounded-t-md bg-gradient-to-t from-[#0C66E4] to-[#579DFF] shadow-sm"
                    style={{ height: `${(d.count / maxDist) * 100}%`, minHeight: d.count > 0 ? 6 : 0 }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.5, delay: d.points * 0.012, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <span className="text-[11px] font-medium text-paper-400">{d.points}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Quem mais estimou */}
        <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
          <p className="text-sm font-semibold text-ink dark:text-paper">Quem mais votou</p>
          <p className="mt-0.5 text-xs text-paper-400">Participação em rodadas de estimativa.</p>
          <div className="mt-4 space-y-3">
            {summary.top_estimators.map((e) => (
              <div key={e.name} className="flex items-center gap-3">
                <NameAvatar name={e.name} />
                <span className="w-28 shrink-0 truncate text-xs text-paper-500">{e.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                  <motion.div
                    className="h-full origin-left rounded-full bg-gradient-to-r from-[#0C66E4] to-[#579DFF]"
                    style={{ width: `${(e.votes / maxVotes) * 100}%` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-semibold text-ink dark:text-paper">{e.votes}</span>
              </div>
            ))}
            {summary.top_estimators.length === 0 && (
              <p className="text-sm text-paper-400">Ninguém votou ainda.</p>
            )}
          </div>
        </section>

        {/* Atividade recente entre todas as salas */}
        <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card lg:col-span-2">
          <p className="text-sm font-semibold text-ink dark:text-paper">Atividade recente</p>
          <p className="mt-0.5 text-xs text-paper-400">Últimas cartas decididas em qualquer sala do workspace.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {summary.recent_rounds.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-800/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink dark:text-paper">
                    <span className="font-mono text-[10px] text-paper-400">{r.card_ref}</span> {r.card_title}
                  </p>
                  <p className="truncate text-[11px] text-paper-400">{r.session_name} · {fmtDateTime(r.decided_at)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#0C66E4]/10 px-2 py-0.5 text-[11px] font-bold text-[#0C66E4]">peso {r.final_points}</span>
              </div>
            ))}
            {summary.recent_rounds.length === 0 && (
              <p className="text-sm text-paper-400">Nenhum card foi votado ainda.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function SessionListView({
  workspaceId,
  projects,
}: {
  workspaceId: string
  projects: { id: string; name: string; key: string }[]
}) {
  const navigate = useNavigate()
  const createSession = useCreateSession(workspaceId)
  const createSquadSession = useCreateSquadSession(workspaceId)
  const { data: squads = [] } = useSquads(workspaceId)
  const [showModal, setShowModal] = useState(false)
  const [sessions, setSessions] = useState<PokerSession[]>([])

  useEffect(() => {
    import("./poker.api").then((api) =>
      api.listSessions(workspaceId).then(setSessions).catch(() => {})
    )
  }, [workspaceId])

  const handleCreate = async (projectId: string, name: string) => {
    const session = await createSession.mutateAsync({ projectId, name })
    setShowModal(false)
    navigate(`/app/poker/${session.id}`)
  }

  /** Sessão da squad: uma reunião estima cards de vários projetos. */
  const handleCreateForSquad = async (squadId: string, name: string) => {
    const session = await createSquadSession.mutateAsync({ squadId, name })
    setShowModal(false)
    navigate(`/app/poker/${session.id}`)
  }

  /** Rótulo de origem da sessão: a squad quando existe, senão o projeto.
   *  Sessão de squad não tem projeto — ela estima cards de vários. */
  const projectLabel = (session: { project_id: string | null; squad_id: string | null }) => {
    const squad = squads.find((sq) => sq.id === session.squad_id)
    if (squad) return squad.name
    const p = projects.find((pr) => pr.id === session.project_id)
    return p ? `[${p.key}] ${p.name}` : "Projeto"
  }

  return (
    <div className="scrollbar-slim h-full min-h-0 w-full flex-1 overflow-y-auto px-6 py-7">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink dark:text-paper">Planning Poker</h1>
          <p className="mt-0.5 text-sm text-paper-500">Estimativas colaborativas com seu time</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-[#0C66E4] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0055CC]"
        >
          + Nova sessão
        </button>
      </div>

      <PokerResumoDashboard workspaceId={workspaceId} />

      <p className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-paper-400">Histórico de sessões</p>
      {sessions.length === 0 ? (
        <div className="py-20 text-center">
          <Spade className="mx-auto mb-4 size-12 text-paper-300" aria-hidden />
          <p className="text-lg font-semibold text-paper-500">Nenhuma sessão ainda</p>
          <p className="mt-1 text-sm text-paper-400">Crie uma sala e convide seu time para estimar cards</p>
        </div>
      ) : (
        <motion.div variants={LIST_IN} initial="hidden" animate="show" className="space-y-2">
          {sessions.map((s) => (
            <SessionHistoryCard
              key={s.id}
              session={s}
              projectLabel={projectLabel(s)}
              onEnter={() => navigate(`/app/poker/${s.id}`)}
            />
          ))}
        </motion.div>
      )}
      {showModal && (
        <NewSessionModal
          projects={projects}
          squads={squads}
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
          onCreateForSquad={handleCreateForSquad}
        />
      )}
    </div>
  )
}

// ─── Sala ─────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: PokerSession["status"] }) {
  const cfg = {
    waiting: { label: "Aguardando", cls: "border-[#2E3036] bg-[#212328] text-[#8590A2]" },
    voting: { label: "Votação aberta", cls: "border-yellow-500/30 bg-yellow-500/10 text-yellow-500" },
    revealed: { label: "Votos revelados", cls: "border-[#0C66E4]/40 bg-[#0C66E4]/10 text-[#579DFF]" },
    done: { label: "Concluída", cls: "border-green-500/30 bg-green-500/10 text-green-400" },
  }[status]
  return (
    <span className={cx("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", cfg.cls)}>
      {status === "voting" && <span className="size-1.5 animate-pulse rounded-full bg-yellow-500" />}
      {status === "done" && <CheckCircle2 className="size-3" aria-hidden />}
      {cfg.label}
    </span>
  )
}

// Quem ainda não tem avatar senta como iniciais. Em vez de só constatar isso,
// a sala oferece as duas saídas: sortear um na hora (um clique, sem sair da
// rodada) ou abrir o editor completo.
function AvatarPrompt({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  const handleRandom = async () => {
    setSaving(true)
    try {
      await saveAvatarConfig(randomAvatar())
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-[#2E3036] bg-[#212328] px-2 py-1">
      <span className="pl-1 text-[11px] text-[#8590A2]">Sem avatar</span>
      <button
        onClick={handleRandom}
        disabled={saving}
        className="rounded-full bg-[#0C66E4] px-2.5 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#0055CC] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4]"
      >
        {saving ? "Sorteando…" : "Sortear"}
      </button>
      <button
        onClick={() => navigate("/app/avatar")}
        className="rounded-full px-2 py-0.5 text-[11px] text-[#B3B9C4] transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4]"
      >
        Criar
      </button>
    </div>
  )
}

function RoomView({ sessionId, userId }: { sessionId: string; userId: string }) {
  const navigate = useNavigate()
  const { data: session, refetch: refetchSession } = useSession(sessionId)
  // Busca da fila: com a sessão da squad, a lista vem de TODOS os projetos do
  // workspace — sem busca, escolher um card viraria rolagem infinita.
  const [cardQuery, setCardQuery] = useState("")
  // Host pode restringir a fila a um projeto específico sem precisar criar
  // outra sala — "" mantém o comportamento antigo (cards do workspace todo).
  const [cardProjectFilter, setCardProjectFilter] = useState("")
  const { data: allCards = [] } = usePokerCards(sessionId, cardQuery, cardProjectFilter || undefined)
  const { data: projects = [] } = useProjects(session?.workspace_id ?? null)
  const submitVote = useSubmitVote(sessionId)
  const updateSession = useUpdateSession(sessionId)
  const applyPoints = useApplyPoints(sessionId)
  const leaveSession = useLeaveSession()
  const [copied, setCopied] = useState(false)
  const sendReaction = useSendReaction(sessionId)
  const sendEmote = useSendEmote(sessionId)
  useHeartbeat(sessionId)
  const project = projects.find((p) => p.id === session?.project_id) ?? null

  // Reações em voo na tela. Não vivem no cache do react-query porque não são
  // estado da sala e sim eventos: cada uma existe até a animação terminar.
  const [flying, setFlying] = useState<
    { key: string; emoji: string; from: string; to: string }[]
  >([])
  const seenReactions = useRef<Set<string>>(new Set())
  // Quem está no gesto de arremesso e quem já levou o emoji. Derivar isso de
  // `flying` direto faria o braço socar em loop durante todo o voo e o alvo
  // acenar antes de o emoji chegar nele.
  const [throwers, setThrowers] = useState<string[]>([])
  const [cheerers, setCheerers] = useState<string[]>([])
  // Emote em execução por pessoa. Some sozinho: um emote é um gesto com fim,
  // não um estado — deixar ligado faria a mesa inteira dançar para sempre.
  const [emoting, setEmoting] = useState<Record<string, string>>({})
  const timers = useRef<number[]>([])

  // Mídia da mesa: só conecta no SFU quando alguém liga microfone ou câmera —
  // abrir a sala não deve custar uma conexão de vídeo para quem só observa.
  const [mediaSession, setMediaSession] = useState<JoinResult | null>(null)
  const [micOn, setMicOn] = useState(false)
  const [camOn, setCamOn] = useState(false)
  const joiningMedia = useRef(false)

  // Espaço realmente disponível para a mesa: da borda de cima da área até o
  // fim da janela, menos tudo que fica abaixo dela (progresso, painel do host,
  // baralho). A conta parte da JANELA, não de `flex-1`: nesta árvore o
  // `h-full` não resolve numa altura concreta, então o contêiner cresce com o
  // conteúdo e "espaço disponível" media sempre a própria mesa.
  const areaRef = useRef<HTMLDivElement>(null)
  const belowRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    const measure = () => {
      const rect = area.getBoundingClientRect()
      const below = belowRef.current?.getBoundingClientRect().height ?? 0
      // 24 = respiro do rodapé + o gap entre a mesa e o bloco de baixo.
      const height = Math.max(0, window.innerHeight - rect.top - below - 24)
      // Só publica mudança real: a medição roda dentro de um ResizeObserver
      // que a própria mudança de escala dispara, e um objeto novo a cada
      // passada manteria o React re-renderizando à toa.
      setStage((prev) =>
        Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width: rect.width, height },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    if (belowRef.current) observer.observe(belowRef.current)
    window.addEventListener("resize", measure)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const playThrow = (from: string, to: string) => {
    const after = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms))
    }
    const drop = (setter: typeof setThrowers, id: string) =>
      setter((prev) => {
        const i = prev.indexOf(id)
        return i === -1 ? prev : [...prev.slice(0, i), ...prev.slice(i + 1)]
      })

    setThrowers((prev) => [...prev, from])
    after(THROW_GESTURE_MS, () => drop(setThrowers, from))
    // O alvo só reage quando o emoji encosta.
    after(IMPACT_MS, () => {
      setCheerers((prev) => [...prev, to])
      // Contado a partir do impacto, não do arremesso — este `after` já roda
      // dentro do callback do impacto.
      after(CHEER_MS, () => drop(setCheerers, to))
    })
  }

  const playEmote = (userId: string, emote: string) => {
    setEmoting((prev) => ({ ...prev, [userId]: emote }))
    timers.current.push(
      window.setTimeout(
        () =>
          setEmoting((prev) => {
            // Só limpa se ninguém trocou o emote no meio — senão o timer do
            // gesto antigo apagaria o novo.
            if (prev[userId] !== emote) return prev
            const { [userId]: _, ...rest } = prev
            return rest
          }),
        EMOTE_MS,
      ),
    )
  }

  useEffect(() => {
    const incoming = session?.reactions ?? []
    const fresh = incoming.filter(
      // As minhas já foram animadas no clique; o poll as devolve por alguns
      // segundos e sem esse filtro elas voariam de novo.
      (r) => !seenReactions.current.has(r.id) && r.from_user_id !== userId,
    )
    if (fresh.length === 0) return
    fresh.forEach((r) => seenReactions.current.add(r.id))

    // Emote não atravessa a mesa: anima só o sprite de quem mandou.
    const emotes = fresh.filter((r) => r.emote)
    const thrown = fresh.filter((r) => !r.emote && r.to_user_id)
    emotes.forEach((r) => playEmote(r.from_user_id, r.emote))

    if (thrown.length === 0) return
    setFlying((prev) => [
      ...prev,
      ...thrown.map((r) => ({
        key: r.id,
        emoji: r.emoji,
        from: r.from_user_id,
        to: r.to_user_id!,
      })),
    ])
    thrown.forEach((r) => playThrow(r.from_user_id, r.to_user_id!))
  }, [session?.reactions, userId])

  const handleReact = (toUserId: string, emoji: string) => {
    // Anima antes de a rede responder: reagir tem que dar retorno imediato,
    // e um POST que falhe não custa nada além de a emoji não chegar do outro lado.
    setFlying((prev) => [
      ...prev,
      { key: `local-${Date.now()}-${emoji}`, emoji, from: userId, to: toUserId },
    ])
    playThrow(userId, toUserId)
    sendReaction.mutate({ toUserId, emoji })
  }

  const handleEmote = (emote: string) => {
    playEmote(userId, emote)
    sendEmote.mutate(emote)
  }

  // O backend devolve todos os votos do card, inclusive de quem já saiu da
  // sala (`list_by_card` não filtra por presença). Contar esses votos dava
  // "3 de 2 votaram" e deixava ausente decidindo média e consenso.
  // Hooks não podem vir depois de um return condicional, então rodam sempre
  // — mesmo com `session` ainda undefined — usando arrays vazios como fallback.
  const liveVotes = useMemo(() => {
    if (!session) return []
    const seated = new Set(session.participants.map((p) => p.user_id))
    return session.votes.filter((v) => seated.has(v.participant_id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.votes, session?.participants])
  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-[#8590A2]" style={{ background: P.bg }}>
        Carregando sala…
      </div>
    )
  }

  const liveSession = { ...session, votes: liveVotes }
  const me = session.participants.find((p) => p.user_id === userId)
  const isHost = session.created_by === userId
  const myVote = liveVotes.find((v) => v.participant_id === userId)?.value ?? null
  // A mesa comporta 10 assentos; acima disso a órbita fica ilegível. O
  // cabeçalho continua mostrando o total real para ninguém achar que sumiu.
  // `?mockseats=N` completa a mesa com gente falsa para inspecionar a
  // proporção com a mesa cheia. Fora desse parâmetro, `mockCount` é 0 e a
  // lista é exatamente a que veio do backend.
  const mockCount = mockSeatCount(window.location.search)
  const participants = [
    ...session.participants,
    ...makeMockParticipants(Math.max(0, mockCount - session.participants.length)),
  ].slice(0, SEATS_MAX)
  // Com mídia na sala a órbita abre para caber os cartões de câmera; sem ela a
  // mesa fica compacta como sempre foi.
  const videoActive = mockCount > 0 || mediaSession !== null
  const { width: tableWidth, height: tableHeight } = tableSize(participants.length)
  const seats = seatLayout(
    Math.max(participants.length, 1),
    tableWidth,
    tableHeight,
    videoActive,
  )
  const margins = wrapperMargins(videoActive)
  const wrapperWidth = tableWidth + margins.x * 2
  const wrapperHeight = tableHeight + margins.y * 2
  // Encolhe a mesa inteira (assentos, cartas e câmeras juntos) até caber.
  const tableScale = fitScale({ width: wrapperWidth, height: wrapperHeight }, stage)
  // Onde cada pessoa está sentada — origem e destino das reações em voo.
  // Medido a partir do centro do wrapper, igual aos assentos.
  const seatOf = (userId: string): { x: number; y: number } | null => {
    const i = participants.findIndex((p) => p.user_id === userId)
    const slot = i === -1 ? null : seats[i]
    return slot ? { x: slot.ox, y: slot.oy } : null
  }
  const currentCard = allCards.find((c) => c.id === session.current_card_id) ?? null
  const selectedIds = session.card_ids

  const handleSelectCard = (id: string) => {
    const nextIds = selectedIds.includes(id) ? selectedIds : [...selectedIds, id]
    updateSession.mutate({ status: "voting", current_card_id: id, card_ids: nextIds })
  }

  // Encerrar tira a sala da lista de "salas abertas" do board — sem isso as
  // salas velhas se acumulavam ali e não havia como limpá-las.
  const handleFinish = () => {
    if (!window.confirm("Encerrar esta sala? Ela sai da lista de salas abertas.")) return
    updateSession.mutate(
      { status: "done" },
      { onSuccess: () => navigate("/app/poker") },
    )
  }

  // Sair não encerra a sala para os outros — só tira a própria participação
  // (o host some da lista de presença, mas a sala segue aberta para quem ficou).
  const handleLeave = () => {
    leaveSession.mutate(sessionId, { onSuccess: () => navigate("/app/poker") })
  }

  // A conexão é preguiçosa: o primeiro toggle entra na sala, os seguintes só
  // ligam/desligam a faixa. Sair da página derruba a conexão junto. O botão só
  // acende se a entrada der certo — aceso sem sala parece "liguei e não ligou".
  const toggleMedia = async (kind: "mic" | "cam") => {
    const next = kind === "mic" ? !micOn : !camOn
    if (next && !mediaSession && sessionId) {
      if (joiningMedia.current) return
      joiningMedia.current = true
      try {
        setMediaSession(await joinPokerRoom(sessionId))
      } catch {
        notify.error("Não foi possível entrar na sala de voz desta mesa.")
        return
      } finally {
        joiningMedia.current = false
      }
    }
    if (kind === "mic") setMicOn(next)
    else setCamOn(next)
  }

  // Permissão negada ou dispositivo ocupado: desfaz o botão em vez de deixá-lo
  // aceso sem mídia no ar.
  const handleMediaError = (kind: MediaKind, error: unknown) => {
    if (kind === "video") setCamOn(false)
    else setMicOn(false)
    notify.error(mediaErrorMessage(kind, error))
  }

  // Centro do cartão de vídeo, já calculado para fora da mesa pelo layout —
  // também em relação ao centro do wrapper.
  const videoAnchorOf = (uid: string) => {
    const i = participants.findIndex((p) => p.user_id === uid)
    const slot = i === -1 ? null : seats[i]
    return slot ? { x: slot.videoOx, y: slot.videoOy } : null
  }

  const handleReveal = () => updateSession.mutate({ status: "revealed" })
  const handleApply = (points: number) => applyPoints.mutate(points)

  const copyInvite = () => {
    navigator.clipboard.writeText(`${window.location.origin}/app/poker/${sessionId}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleNextCard = () => {
    const idx = selectedIds.indexOf(session.current_card_id ?? "")
    const next = selectedIds[idx + 1] ?? null
    if (next) {
      updateSession.mutate({ status: "voting", current_card_id: next })
    } else {
      updateSession.mutate({ status: "done" })
    }
  }

  return (
    <div
      className="flex h-full max-h-full flex-col overflow-hidden lg:flex-row"
      style={{
        background: `radial-gradient(ellipse 80% 60% at 50% -10%, rgba(12,102,228,0.14), transparent), ${P.bg}`,
      }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header da sala */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3 backdrop-blur"
          style={{ borderColor: P.borderSoft, background: "rgba(23,25,30,0.72)" }}
        >
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl border border-[#2E3036] bg-[#212328]">
              <Spade className="size-4 text-[#579DFF]" aria-hidden />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold leading-tight text-[#F7F8F9]">{session.name}</h1>
                {project && (
                  <button
                    onClick={() => navigate("/app/boards")}
                    title="Abrir o board deste projeto"
                    className="rounded-full border border-[#2E3036] bg-[#212328] px-2 py-0.5 text-[10px] font-semibold text-[#579DFF] transition-colors hover:border-[#0C66E4]"
                  >
                    [{project.key}] {project.name}
                  </button>
                )}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-[#8590A2]">
                <Radio className="size-3 text-green-400" aria-hidden />
                {session.participants.length} participante
                {session.participants.length !== 1 ? "s" : ""} online
                {session.participants.length > SEATS_MAX &&
                  ` (${SEATS_MAX} na mesa)`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Pilha de avatares */}
            <div className="mr-1 flex -space-x-2">
              {participants.slice(0, 5).map((p) => (
                <span
                  key={p.user_id}
                  title={p.user_name}
                  className="grid size-7 place-items-center rounded-full border-2 border-[#0A0B0D] bg-[#2E3036] text-[9px] font-bold text-[#B3B9C4]"
                >
                  {p.avatar_initials}
                </span>
              ))}
              {participants.length > 5 && (
                <span className="grid size-7 place-items-center rounded-full border-2 border-[#0A0B0D] bg-[#212328] text-[9px] font-bold text-[#8590A2]">
                  +{participants.length - 5}
                </span>
              )}
            </div>
            <button
              onClick={() => void toggleMedia("mic")}
              aria-pressed={micOn}
              aria-label={micOn ? "Desligar microfone" : "Ligar microfone"}
              title={micOn ? "Desligar microfone" : "Ligar microfone"}
              className={cx(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4]",
                micOn
                  ? "border-[#0C66E4] bg-[#0C66E4]/20 text-[#579DFF]"
                  : "border-[#2E3036] text-[#B3B9C4] hover:border-[#0C66E4] hover:text-[#F7F8F9]",
              )}
            >
              {micOn ? <Mic className="size-3.5" aria-hidden /> : <MicOff className="size-3.5" aria-hidden />}
            </button>
            <button
              onClick={() => void toggleMedia("cam")}
              aria-pressed={camOn}
              aria-label={camOn ? "Desligar câmera" : "Ligar câmera"}
              title={camOn ? "Desligar câmera" : "Ligar câmera"}
              className={cx(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4]",
                camOn
                  ? "border-[#0C66E4] bg-[#0C66E4]/20 text-[#579DFF]"
                  : "border-[#2E3036] text-[#B3B9C4] hover:border-[#0C66E4] hover:text-[#F7F8F9]",
              )}
            >
              {camOn ? <Video className="size-3.5" aria-hidden /> : <VideoOff className="size-3.5" aria-hidden />}
            </button>
            <button
              onClick={copyInvite}
              aria-label="Copiar link de convite da sala"
              className="flex items-center gap-1.5 rounded-full border border-[#2E3036] px-3 py-1 text-xs text-[#B3B9C4] transition-colors hover:border-[#0C66E4] hover:text-[#F7F8F9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4]"
            >
              <Link2 className="size-3.5" aria-hidden />
              {copied ? "Link copiado!" : "Convidar"}
            </button>
            {isHost && session.status !== "done" && (
              <button
                onClick={handleFinish}
                disabled={updateSession.isPending}
                aria-label="Encerrar sala de Planning Poker"
                className="flex items-center gap-1.5 rounded-full border border-[#2E3036] px-3 py-1 text-xs text-[#B3B9C4] transition-colors hover:border-red-500 hover:text-red-400 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4]"
              >
                <CheckCircle2 className="size-3.5" aria-hidden />
                Encerrar sala
              </button>
            )}
            <button
              onClick={handleLeave}
              disabled={leaveSession.isPending}
              aria-label="Sair da sala de Planning Poker"
              className="flex items-center gap-1.5 rounded-full border border-[#2E3036] px-3 py-1 text-xs text-[#B3B9C4] transition-colors hover:border-red-500 hover:text-red-400 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0C66E4]"
            >
              <LogOut className="size-3.5" aria-hidden />
              Sair da sala
            </button>
            {!me?.avatar_config && <AvatarPrompt onDone={() => refetchSession()} />}
            <StatusPill status={session.status} />
          </div>
        </div>

        {/* Mesa */}
        <div ref={areaRef} className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-6 py-4">
          {/* Palco: o que sobrou depois do baralho e dos controles do host —
              são eles que não podem ser cortados. A mesa se encaixa no que
              restar; ligar as câmeras a faz crescer bem além desta área.

              A mesa fica em `absolute inset-0` de propósito. Medindo um palco
              que a própria mesa infla, o espaço disponível cresce junto com ela
              e a escala dá sempre 1 — foi o que aconteceu na primeira versão.
              Fora do fluxo, o palco tem só o tamanho que o flex lhe deu. */}
          <div
            className="relative w-full shrink-0"
            style={{ height: wrapperHeight * tableScale }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="shrink-0"
              style={{ width: wrapperWidth * tableScale, height: wrapperHeight * tableScale }}
            >
          {/* Wrapper maior que a mesa: assentos orbitam FORA da borda. Entrar
              na sala de mídia abre a órbita e muda este tamanho — por isso
              tudo aqui dentro se posiciona pelo CENTRO (left/top 50%), que não
              se move, e não pelo canto, que anda quando o wrapper cresce. */}
          <div
            className="relative shrink-0 origin-top-left"
            style={{
              width: wrapperWidth,
              height: wrapperHeight,
              transform: `scale(${tableScale})`,
            }}
          >
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 transition-all duration-500"
              style={{
                width: tableWidth,
                height: tableHeight,
                background: "linear-gradient(145deg, #212328, #0A0B0D)",
                borderColor: session.status === "revealed" ? "rgba(12,102,228,0.55)" : P.border,
                boxShadow:
                  session.status === "revealed"
                    ? "inset 0 2px 20px rgba(0,0,0,0.5), 0 0 60px rgba(12,102,228,0.25)"
                    : "inset 0 2px 20px rgba(0,0,0,0.5), 0 0 40px rgba(12,102,228,0.08)",
              }}
            >
              {session.status === "voting" && (
                <div className="poker-glow pointer-events-none absolute -inset-1 rounded-[50%] border border-[#0C66E4]/40" aria-hidden />
              )}
              <div className="absolute inset-5 rounded-[50%] border border-[#0C66E4]/10" aria-hidden />

              {/* Conteúdo central da mesa */}
              <div className="absolute inset-0 flex items-center justify-center">
                <TableCenter session={session} currentCard={currentCard} isHost={isHost} />
              </div>
            </div>

            {/* Assentos na órbita externa */}
            <AnimatePresence>
              {participants.map((p, i) => {
                const vote = liveVotes.find((v) => v.participant_id === p.user_id)
                return (
                  <Seat
                    key={p.user_id}
                    participant={p}
                    hasVoted={vote?.has_voted ?? false}
                    voteValue={vote?.value ?? null}
                    revealed={session.status === "revealed"}
                    voting={session.status === "voting"}
                    index={i}
                    x={seats[i]?.ox ?? 0}
                    y={seats[i]?.oy ?? 0}
                    canReact={p.user_id !== userId && !isMockSeat(p.user_id)}
                    onReact={(emoji) => handleReact(p.user_id, emoji)}
                    cheering={cheerers.includes(p.user_id)}
                    throwing={throwers.includes(p.user_id)}
                    facing={seatFacingAt(seats[i]?.angle ?? -Math.PI / 2)}
                    emote={emoting[p.user_id] ?? null}
                    onEmote={p.user_id === userId ? handleEmote : undefined}
                  />
                )
              })}
            </AnimatePresence>

            {/* Câmeras ancoradas acima de cada assento */}
            {mockCount > 0 && (
              <MockVideoTiles
                people={participants.map((p) => ({
                  userId: p.user_id,
                  name: p.user_name.split(" ")[0],
                }))}
                seatOf={videoAnchorOf}
              />
            )}
            {mediaSession && (
              <PokerVideoOverlay
                session={mediaSession}
                seatOf={videoAnchorOf}
                audio={micOn}
                video={camOn}
                onMediaError={handleMediaError}
              />
            )}

            {/* Reações atravessando a mesa */}
            {flying.map((f) => {
              const from = seatOf(f.from)
              const to = seatOf(f.to)
              if (!from || !to) return null
              return (
                <FlyingReaction
                  key={f.key}
                  emoji={f.emoji}
                  from={from}
                  to={to}
                  onDone={() =>
                    setFlying((prev) => prev.filter((x) => x.key !== f.key))
                  }
                />
              )
            })}
          </div>
            </div>
            </div>
          </div>

          {/* Tudo abaixo da mesa vive junto para ser medido de uma vez: é o
              espaço que a mesa não pode ocupar, sob pena de cortar o baralho
              ou o botão de revelar. */}
          <div ref={belowRef} className="flex w-full shrink-0 flex-col items-center gap-4">
          {session.status === "voting" && (
            <VoteProgress
              voted={liveVotes.filter((v) => v.has_voted).length}
              total={participants.length}
            />
          )}

          {/* Stats da rodada + ações do host (abaixo da mesa) */}
          <RoundPanel
            session={liveSession}
            isHost={isHost}
            onReveal={handleReveal}
            onNextCard={handleNextCard}
            onApply={handleApply}
            applying={applyPoints.isPending}
          />

          {/* Baralho do jogador */}
          {session.status === "voting" && (
            <div className="flex flex-col items-center gap-2.5 pb-2">
              <p className="text-xs text-[#8590A2]">
                {myVote ? (
                  <>Seu voto: <b className="text-[#579DFF]">{myVote}</b> — clique em outra carta para mudar</>
                ) : (
                  "Escolha sua carta:"
                )}
              </p>
              <VotingRow myVote={myVote} onVote={(v) => submitVote.mutate(v)} />
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Painel do host: fila de votação */}
      {isHost && (
        <div
          className="flex w-full flex-col border-t p-4 lg:w-80 lg:border-l lg:border-t-0"
          style={{ borderColor: P.borderSoft, background: "rgba(10,11,13,0.92)" }}
        >
          <CardSelector
            cards={allCards}
            queueIds={selectedIds}
            currentCardId={session.current_card_id}
            onSelectCard={handleSelectCard}
            query={cardQuery}
            onQueryChange={setCardQuery}
            projects={projects}
            projectFilter={cardProjectFilter}
            onProjectFilterChange={setCardProjectFilter}
          />
        </div>
      )}
    </div>
  )
}

export function PokerPage() {
  const { sessionId } = useParams<{ sessionId?: string }>()
  const { activeWorkspaceId } = useWorkspaceStore()
  const { data: projects = [] } = useProjects(activeWorkspaceId)
  const joinSession = useJoinSession(sessionId ?? null)
  const userId = useAuthStore((s) => s.user?.id ?? "")

  useEffect(() => {
    if (!sessionId) return
    joinSession.mutate()
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // `mode="wait"` porque as duas telas ocupam a mesma área: sobrepor a mesa
  // escura ao lobby claro por 200ms daria um flash. O lobby sai encolhendo de
  // leve e a mesa cresce — a sala "vem de dentro" do card que foi clicado.
  return (
    <AnimatePresence mode="wait">
      {sessionId ? (
        <motion.div
          key="room"
          className="h-full"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <RoomView sessionId={sessionId} userId={userId} />
        </motion.div>
      ) : (
        <motion.div
          key="lobby"
          className="h-full min-h-0"
          initial={{ opacity: 0, scale: 0.99 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.99 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <SessionListView
            workspaceId={activeWorkspaceId ?? ""}
            projects={projects}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
