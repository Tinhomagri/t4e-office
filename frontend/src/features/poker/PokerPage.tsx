// Sala de Planning Poker — mesa oval com assentos ao redor, votação fibonacci,
// fila de cards do host e estatísticas da rodada. Tema escuro próprio da sala.
import { useEffect, useMemo, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  Link2,
  ListOrdered,
  Radio,
  SkipForward,
  Sparkles,
  Spade,
} from "lucide-react"
import { useAuthStore } from "@/features/auth/auth.store"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { useProjects } from "@/features/workspace/workspace.hooks"
import {
  useSession,
  usePokerCards,
  useHeartbeat,
  useCreateSession,
  useJoinSession,
  useSubmitVote,
  useUpdateSession,
  useApplyPoints,
  useRounds,
  usePokerSummary,
} from "./poker.hooks"
import { FIBONACCI } from "./poker.types"
import type { PokerParticipant, PokerCard, PokerSession } from "./poker.types"

// Paleta da sala — tokens locais para consistência absoluta entre elementos.
const P = {
  bg: "#0b0b1c",
  panel: "#13132b",
  panelSoft: "#101024",
  border: "#26264a",
  borderSoft: "#1c1c38",
  text: "#f0f0f8",
  textSoft: "#a0a0c0",
  textDim: "#5d5d84",
  accent: "#6c5cf0",
  accentSoft: "#a99bfa",
}

// Valores numéricos do deck (sem o "?") — estatísticas e seletor de pontuação final.
const DECK_NUMBERS = FIBONACCI.filter((v) => v !== "?").map(Number)

function cx(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(" ")
}

// Mesa se ajusta ao número de participantes.
function tableSize(count: number): { width: number; height: number } {
  if (count <= 2) return { width: 340, height: 200 }
  if (count <= 4) return { width: 430, height: 240 }
  if (count <= 7) return { width: 520, height: 280 }
  return { width: 600, height: 310 }
}

// Assentos ficam FORA da borda da mesa (wrapper maior que a mesa) —
// nada de carta sobrepondo avatar ou o centro. Margens dimensionadas para
// conter o assento inteiro (carta 44 + avatar 40 + nome ≈ 115px de altura).
const SEAT_MARGIN_X = 110
const SEAT_MARGIN_Y = 105

// Posições em px no wrapper: elipse com raio = metade da mesa + folga fixa.
function seatPositions(
  total: number,
  tableWidth: number,
  tableHeight: number,
): { x: number; y: number }[] {
  const cx = tableWidth / 2 + SEAT_MARGIN_X
  const cy = tableHeight / 2 + SEAT_MARGIN_Y
  const rx = tableWidth / 2 + 52
  const ry = tableHeight / 2 + 46
  return Array.from({ length: total }, (_, i) => {
    const angle = (i / total) * 2 * Math.PI - Math.PI / 2
    return {
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
    }
  })
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

function Seat({
  participant,
  hasVoted,
  voteValue,
  revealed,
  voting,
  index,
  x,
  y,
}: {
  participant: PokerParticipant
  hasVoted: boolean
  voteValue: string | null
  revealed: boolean
  voting: boolean
  index: number
  x: number
  y: number
}) {
  return (
    <div
      className="absolute"
      style={{ left: x, top: y, transform: "translate(-50%,-50%)" }}
    >
    <div
      className="flex w-20 flex-col items-center gap-1.5 poker-pop"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Carta com flip 3D; revelação em cascata */}
      <div className="h-11 w-8" style={{ perspective: 400 }}>
        <div
          className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
          style={{
            transform: revealed && hasVoted ? "rotateY(180deg)" : "rotateY(0deg)",
            transitionDelay: revealed ? `${index * 120}ms` : "0ms",
          }}
        >
          <div
            className={cx(
              "absolute inset-0 flex items-center justify-center rounded-md border text-xs font-bold [backface-visibility:hidden] transition-colors duration-300",
              hasVoted
                ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.25)]"
                : "border-[#2c2c52] bg-[#14142c] text-[#5d5d84]",
              voting && !hasVoted && "poker-float",
            )}
          >
            {hasVoted ? "✓" : "?"}
          </div>
          <div
            className="absolute inset-0 flex items-center justify-center rounded-md border border-[#6c5cf0] bg-gradient-to-br from-[#7c6cff] to-[#5a4dd0] text-sm font-bold text-white shadow-[0_0_14px_rgba(108,92,240,0.5)] [backface-visibility:hidden]"
            style={{ transform: "rotateY(180deg)" }}
          >
            {voteValue ?? "–"}
          </div>
        </div>
      </div>
      <div
        className={cx(
          "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300",
          participant.is_host
            ? "border-[#6c5cf0] bg-[#6c5cf0]/20 text-[#a99bfa]"
            : "border-[#33335c] bg-[#191934] text-[#c8c8e0]",
          voting && !hasVoted && "poker-pulse",
        )}
      >
        {participant.avatar_initials}
      </div>
      <span className="max-w-[80px] truncate text-center text-[10px] font-medium leading-tight text-[#8888ac]">
        {participant.user_name.split(" ")[0]}
        {participant.is_host && <span className="ml-1 text-[#a99bfa]" title="Host">★</span>}
      </span>
    </div>
    </div>
  )
}

// ─── Confete no consenso ─────────────────────────────────────────────────────

function ConfettiBurst() {
  const pieces = ["🎉", "✨", "🎊", "⭐", "💜", "✨", "🎉", "⭐"]
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-2 flex justify-center" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="poker-confetti absolute text-lg"
          style={{
            left: `${18 + i * 9}%`,
            animationDelay: `${i * 90}ms`,
            animationDuration: `${800 + (i % 3) * 250}ms`,
          }}
        >
          {p}
        </span>
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
          ? "border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
          : "border-[#26264a]",
      )}
      style={{ background: P.panelSoft }}
    >
      {stats.consensus && <ConfettiBurst />}
      <div className="flex items-center justify-center gap-1.5 text-[#a99bfa]">
        <Sparkles className="size-4" aria-hidden />
        <span className="text-2xl font-bold tabular-nums">{stats.avg.toFixed(1)}</span>
        <span className="text-[11px] text-[#5d5d84]">média</span>
      </div>

      <div className="mt-2 flex justify-center gap-3 text-[11px] text-[#8888ac]">
        <span>mediana <b className="text-[#d0d0e8]">{stats.median}</b></span>
        <span>min <b className="text-[#d0d0e8]">{stats.min}</b></span>
        <span>max <b className="text-[#d0d0e8]">{stats.max}</b></span>
      </div>

      {stats.consensus ? (
        <div className="mt-2 flex items-center justify-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
          <CheckCircle2 className="size-3" aria-hidden /> Consenso!
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
          <BarChart3 className="size-3" aria-hidden /> Votos divergentes
        </div>
      )}

      <div className="mt-3 flex items-end justify-center gap-2">
        {stats.distribution.map((d) => (
          <div key={d.value} className="flex flex-col items-center gap-1">
            <div
              className="w-5 rounded-t bg-[#6c5cf0]/70"
              style={{ height: `${Math.max((d.count / maxCount) * 28, 4)}px` }}
            />
            <span className="text-[10px] font-semibold text-[#d0d0e8]">{d.value}</span>
            <span className="text-[9px] text-[#5d5d84]">{d.count}</span>
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
              className="poker-float -mx-1.5 flex h-14 w-10 items-center justify-center rounded-lg border border-[#33335c] bg-gradient-to-b from-[#1e1e3c] to-[#14142c] text-lg text-[#a99bfa] shadow-lg"
              style={{ transform: `rotate(${deg}deg)`, animationDelay: `${i * 350}ms` }}
            >
              {i === 1 ? "♠" : "?"}
            </div>
          ))}
        </div>
        <p className="text-sm font-medium text-[#c8c8e0]">
          {isHost ? "Escolha um card na fila para começar" : "Aguardando o host iniciar…"}
        </p>
        {isHost && (
          <p className="text-xs text-[#5d5d84]">
            Clique em <b className="text-[#a99bfa]">Votar</b> no painel ao lado →
          </p>
        )}
      </div>
    )
  }

  if (session.status === "done") {
    return (
      <div className="poker-pop flex flex-col items-center gap-1 text-center">
        <CheckCircle2 className="size-8 text-emerald-400" aria-hidden />
        <p className="text-sm font-semibold text-[#f0f0f8]">Sessão concluída!</p>
        <p className="text-xs text-[#5d5d84]">Todos os cards foram estimados.</p>
      </div>
    )
  }

  if (!currentCard) {
    return <p className="text-sm text-[#5d5d84]">Nenhum card selecionado</p>
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
          background: "linear-gradient(160deg, #191936, #101024)",
          boxShadow: "0 8px 24px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <span className="inline-block rounded-full bg-[#6c5cf0]/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#a99bfa]">
          {currentCard.ref}
        </span>
        <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-[#f0f0f8]">
          {currentCard.title}
        </p>
      </div>

      {session.status === "voting" && (
        <div className="flex w-full flex-col items-center gap-1.5">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[#1a1a36]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#6c5cf0] to-[#a99bfa] transition-all duration-500"
              style={{ width: `${totalVoters > 0 ? (votedCount / totalVoters) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-[#8888ac] tabular-nums">
            {votedCount}/{totalVoters} votaram
          </span>
        </div>
      )}

      {session.status === "revealed" && (
        <span className="rounded-full bg-[#6c5cf0]/15 px-3 py-1 text-[11px] font-semibold text-[#a99bfa]">
          ✨ Votos revelados — veja abaixo
        </span>
      )}
    </div>
  )
}

// ─── Painel da rodada (abaixo da mesa): stats + ações do host ────────────────

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
        className="flex items-center gap-1.5 rounded-lg bg-[#6c5cf0] px-5 py-2 text-xs font-semibold text-white shadow-[0_0_16px_rgba(108,92,240,0.35)] transition-all hover:bg-[#5a4dd0] hover:shadow-[0_0_22px_rgba(108,92,240,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6c5cf0] focus-visible:outline-offset-2"
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
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5d5d84]">Aplicar pontuação final</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {DECK_NUMBERS.map((n) => (
              <button
                key={n}
                onClick={() => setApplyValue(n)}
                aria-pressed={applyValue === n}
                className={cx(
                  "flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6c5cf0]",
                  applyValue === n
                    ? "scale-110 border-[#6c5cf0] bg-[#6c5cf0] text-white shadow-[0_0_10px_rgba(108,92,240,0.5)]"
                    : "border-[#33335c] bg-[#191934] text-[#c8c8e0] hover:border-[#6c5cf0]",
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
              className="flex items-center gap-1.5 rounded-md bg-[#6c5cf0] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#5a4dd0] disabled:opacity-40"
            >
              <Check className="size-3.5" aria-hidden /> Aplicar {applyValue ?? "…"} pontos
            </button>
            <button
              onClick={onNextCard}
              className="flex items-center gap-1 text-[10px] text-[#5d5d84] transition-colors hover:text-[#c8c8e0]"
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
  return (
    <div className="flex flex-wrap items-end justify-center gap-2" role="group" aria-label="Escolha seu voto">
      {FIBONACCI.map((val, i) => {
        const active = myVote === val
        return (
          <button
            key={val}
            onClick={() => onVote(val)}
            aria-pressed={active}
            aria-label={`Votar ${val}`}
            className={cx(
              "poker-deal h-20 w-14 rounded-xl border-2 text-xl font-bold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6c5cf0] focus-visible:outline-offset-2",
              active
                ? "-translate-y-3 border-[#6c5cf0] bg-gradient-to-b from-[#7c6cff] to-[#5a4dd0] text-white shadow-[0_10px_24px_rgba(108,92,240,0.45)]"
                : "border-[#33335c] bg-gradient-to-b from-[#1e1e3c] to-[#14142c] text-[#c8c8e0] hover:-translate-y-2 hover:border-[#6c5cf0] hover:shadow-[0_8px_18px_rgba(108,92,240,0.25)]",
            )}
            style={{ animationDelay: `${i * 45}ms` }}
          >
            {val}
          </button>
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
}: {
  cards: PokerCard[]
  queueIds: string[]
  currentCardId: string | null
  onSelectCard: (id: string) => void
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
            ? "border-[#6c5cf0] bg-[#6c5cf0]/10 shadow-[0_0_12px_rgba(108,92,240,0.15)]"
            : "border-[#1c1c38] bg-[#101024] hover:border-[#2c2c52]",
          done && !isCurrent && "opacity-60",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-[#5d5d84]">{card.ref}</span>
            {done && (
              <span className="rounded bg-emerald-500/15 px-1 text-[10px] font-semibold text-emerald-400">
                {card.points} pts
              </span>
            )}
          </div>
          <p className="truncate text-xs text-[#c8c8e0]">{card.title}</p>
        </div>
        <button
          onClick={() => onSelectCard(card.id)}
          disabled={isCurrent}
          className={cx(
            "shrink-0 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6c5cf0]",
            isCurrent
              ? "cursor-default bg-[#6c5cf0] text-white"
              : "bg-[#22224200] border border-[#33335c] text-[#a0a0c0] hover:border-[#6c5cf0] hover:bg-[#6c5cf0] hover:text-white",
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
        <ListOrdered className="size-4 text-[#a99bfa]" aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#a0a0c0]">Fila de votação</h3>
      </div>

      {inQueue.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[10px] text-[#5d5d84]">
            <span>{estimated} de {inQueue.length} estimados</span>
            <span className="tabular-nums">{inQueue.length > 0 ? Math.round((estimated / inQueue.length) * 100) : 0}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-[#1a1a36]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${inQueue.length > 0 ? (estimated / inQueue.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 scrollbar-slim-dark">
        {inQueue.map(renderItem)}
        {rest.length > 0 && (
          <>
            <p className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-[#44446a]">
              Outros cards do projeto
            </p>
            {rest.map(renderItem)}
          </>
        )}
        {cards.length === 0 && (
          <p className="pt-4 text-center text-xs text-[#44446a]">Nenhum card no projeto</p>
        )}
      </div>
    </div>
  )
}

// ─── Criação/listagem de sessões ─────────────────────────────────────────────

function NewSessionModal({
  projects,
  onClose,
  onCreate,
}: {
  projects: { id: string; name: string; key: string }[]
  onClose: () => void
  onCreate: (projectId: string, name: string) => Promise<void>
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "")
  const [name, setName] = useState("Planning Poker")
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    setLoading(true)
    await onCreate(projectId, name)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="poker-pop w-full max-w-md rounded-2xl border p-6 shadow-2xl" style={{ borderColor: P.border, background: P.panel }}>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#f0f0f8]">
          <Spade className="size-5 text-[#a99bfa]" aria-hidden /> Nova sessão de Planning Poker
        </h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[#8888ac]">Projeto</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-[#33335c] bg-[#191934] px-3 py-2 text-sm text-[#f0f0f8] outline-none focus:border-[#6c5cf0]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>[{p.key}] {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#8888ac]">Nome da sessão</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[#33335c] bg-[#191934] px-3 py-2 text-sm text-[#f0f0f8] outline-none focus:border-[#6c5cf0]"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#8888ac] transition-colors hover:text-[#f0f0f8]">
            Cancelar
          </button>
          <button
            disabled={!projectId || loading}
            onClick={handleCreate}
            className="rounded-lg bg-[#6c5cf0] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5a4dd0] disabled:opacity-40"
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
  voting: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  revealed: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
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
        <span className="shrink-0 rounded-full bg-[#6c5cf0]/10 px-2.5 py-1 text-xs font-bold text-[#6c5cf0]">
          {round.final_points} pts
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
    <div className="rounded-xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 transition-colors hover:border-brand-300">
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
            {session.avg_points != null && <span>média {session.avg_points} pts</span>}
            <span>{session.participants_count ?? 0} participante{session.participants_count === 1 ? "" : "s"}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onEnter() }}
            className="rounded-lg bg-[#6c5cf0] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#5a4dd0]"
          >
            {session.status === "done" ? "Ver sala" : "Entrar"}
          </button>
          <ChevronDown className={cx("size-4 text-paper-400 transition-transform", expanded && "rotate-180")} />
        </div>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-paper-100 dark:border-ink-800 p-4 pt-3">
          {isLoading && <p className="text-xs text-paper-400">Carregando…</p>}
          {!isLoading && (rounds ?? []).length === 0 && (
            <p className="text-xs text-paper-400">Nenhum card foi votado até agora nesta sala.</p>
          )}
          {(rounds ?? []).map((r) => <RoundRow key={r.id} round={r} />)}
        </div>
      )}
    </div>
  )
}

// Avatar com gradiente determinístico pelo nome — mesma técnica usada no
// resto do app (board.shared.avatarGradient), reimplementada aqui para
// manter a feature de poker autocontida.
const AVATAR_GRADIENTS = [
  "from-violet-500 to-purple-700",
  "from-blue-500 to-indigo-700",
  "from-emerald-500 to-teal-700",
  "from-rose-500 to-pink-700",
  "from-amber-500 to-orange-700",
  "from-cyan-500 to-sky-700",
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

function MetricTile({ icon, iconTone, accent, value, label }: { icon: React.ReactNode; iconTone: string; accent: string; value: React.ReactNode; label: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-4 shadow-card">
      <span className={cx("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", accent)} />
      <div className="flex items-center gap-2.5">
        <span className={cx("grid size-8 place-items-center rounded-xl", iconTone)}>{icon}</span>
        <span className="text-2xl font-bold tabular text-ink dark:text-paper">{value}</span>
      </div>
      <p className="mt-2 text-xs font-medium text-paper-500">{label}</p>
    </div>
  )
}

// ─── Aba Resumo do Planning Poker — estilo Jira, agregando TODAS as sessões
// do workspace: quanto foi votado, distribuição de pontos, quem mais votou
// e a atividade recente entre salas. ───────────────────────────────────────
function PokerResumoDashboard({ workspaceId }: { workspaceId: string }) {
  const { data: summary } = usePokerSummary(workspaceId)
  if (!summary) return null

  const maxDist = Math.max(1, ...summary.points_distribution.map((d) => d.count))
  const maxVotes = Math.max(1, ...summary.top_estimators.map((e) => e.votes))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricTile
          icon={<Sparkles className="size-4" />}
          iconTone="bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400"
          accent="from-violet-500 to-fuchsia-400"
          value={summary.sessions_total}
          label="sessões no total"
        />
        <MetricTile
          icon={<Radio className="size-4" />}
          iconTone="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
          accent="from-amber-500 to-orange-400"
          value={summary.sessions_active}
          label="salas em andamento"
        />
        <MetricTile
          icon={<ListOrdered className="size-4" />}
          iconTone="bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
          accent="from-blue-500 to-cyan-400"
          value={summary.rounds_total}
          label="cards estimados no total"
        />
        <MetricTile
          icon={<CheckCircle2 className="size-4" />}
          iconTone="bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400"
          accent="from-green-500 to-emerald-400"
          value={summary.rounds_today}
          label="cards votados hoje"
        />
        <MetricTile
          icon={<BarChart3 className="size-4" />}
          iconTone="bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400"
          accent="from-orange-500 to-amber-400"
          value={summary.avg_points ?? "—"}
          label="média de pontos"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Distribuição de pontos votados */}
        <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
          <p className="text-sm font-semibold text-ink dark:text-paper">Distribuição de pontos</p>
          <p className="mt-0.5 text-xs text-paper-400">Quantas vezes cada valor do deck foi a pontuação final.</p>
          <div className="mt-6 flex h-36 items-end gap-3">
            {summary.points_distribution.map((d) => (
              <div key={d.points} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-semibold text-ink dark:text-paper">{d.count || ""}</span>
                <div className="flex h-28 w-full items-end">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-[#6c5cf0] to-[#a99bfa] shadow-sm"
                    style={{ height: `${(d.count / maxDist) * 100}%`, minHeight: d.count > 0 ? 6 : 0 }}
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
                  <div className="h-full rounded-full bg-gradient-to-r from-[#6c5cf0] to-[#a99bfa]" style={{ width: `${(e.votes / maxVotes) * 100}%` }} />
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
                <span className="shrink-0 rounded-full bg-[#6c5cf0]/10 px-2 py-0.5 text-[11px] font-bold text-[#6c5cf0]">{r.final_points} pts</span>
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

  const projectLabel = (id: string) => {
    const p = projects.find((pr) => pr.id === id)
    return p ? `[${p.key}] ${p.name}` : "Projeto"
  }

  return (
    <div className="w-full px-6 py-7">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink dark:text-paper">Planning Poker</h1>
          <p className="mt-0.5 text-sm text-paper-500">Estimativas colaborativas com seu time</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-[#6c5cf0] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5a4dd0]"
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
        <div className="space-y-2">
          {sessions.map((s) => (
            <SessionHistoryCard
              key={s.id}
              session={s}
              projectLabel={projectLabel(s.project_id)}
              onEnter={() => navigate(`/app/poker/${s.id}`)}
            />
          ))}
        </div>
      )}
      {showModal && (
        <NewSessionModal
          projects={projects}
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}

// ─── Sala ─────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: PokerSession["status"] }) {
  const cfg = {
    waiting: { label: "Aguardando", cls: "border-[#33335c] bg-[#191934] text-[#8888ac]" },
    voting: { label: "Votação aberta", cls: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
    revealed: { label: "Votos revelados", cls: "border-[#6c5cf0]/40 bg-[#6c5cf0]/10 text-[#a99bfa]" },
    done: { label: "Concluída", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  }[status]
  return (
    <span className={cx("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", cfg.cls)}>
      {status === "voting" && <span className="size-1.5 animate-pulse rounded-full bg-amber-400" />}
      {status === "done" && <CheckCircle2 className="size-3" aria-hidden />}
      {cfg.label}
    </span>
  )
}

function RoomView({ sessionId, userId }: { sessionId: string; userId: string }) {
  const navigate = useNavigate()
  const { data: session } = useSession(sessionId)
  const { data: allCards = [] } = usePokerCards(sessionId)
  const { data: projects = [] } = useProjects(session?.workspace_id ?? null)
  const submitVote = useSubmitVote(sessionId)
  const updateSession = useUpdateSession(sessionId)
  const applyPoints = useApplyPoints(sessionId)
  const [copied, setCopied] = useState(false)
  useHeartbeat(sessionId)
  const project = projects.find((p) => p.id === session?.project_id) ?? null

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-[#5d5d84]" style={{ background: P.bg }}>
        Carregando sala…
      </div>
    )
  }

  const isHost = session.created_by === userId
  const myVote = session.votes.find((v) => v.participant_id === userId)?.value ?? null
  const participants = session.participants.slice(0, 10)
  const { width: tableWidth, height: tableHeight } = tableSize(participants.length)
  const seats = seatPositions(Math.max(participants.length, 1), tableWidth, tableHeight)
  const wrapperWidth = tableWidth + SEAT_MARGIN_X * 2
  const wrapperHeight = tableHeight + SEAT_MARGIN_Y * 2
  const currentCard = allCards.find((c) => c.id === session.current_card_id) ?? null
  const selectedIds = session.card_ids

  const handleSelectCard = (id: string) => {
    const nextIds = selectedIds.includes(id) ? selectedIds : [...selectedIds, id]
    updateSession.mutate({ status: "voting", current_card_id: id, card_ids: nextIds })
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
      className="flex h-full flex-col overflow-y-auto lg:flex-row lg:overflow-hidden"
      style={{
        background: `radial-gradient(ellipse 80% 60% at 50% -10%, rgba(108,92,240,0.14), transparent), ${P.bg}`,
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header da sala */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3 backdrop-blur"
          style={{ borderColor: P.borderSoft, background: "rgba(16,16,36,0.6)" }}
        >
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl border border-[#33335c] bg-[#191934]">
              <Spade className="size-4 text-[#a99bfa]" aria-hidden />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold leading-tight text-[#f0f0f8]">{session.name}</h1>
                {project && (
                  <button
                    onClick={() => navigate("/app/boards")}
                    title="Abrir o board deste projeto"
                    className="rounded-full border border-[#33335c] bg-[#191934] px-2 py-0.5 text-[10px] font-semibold text-[#a99bfa] transition-colors hover:border-[#6c5cf0]"
                  >
                    [{project.key}] {project.name}
                  </button>
                )}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-[#5d5d84]">
                <Radio className="size-3 text-emerald-400" aria-hidden />
                {participants.length} participante{participants.length !== 1 ? "s" : ""} online
                {participants.length >= 10 && " (máx. 10)"}
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
                  className="grid size-7 place-items-center rounded-full border-2 border-[#0b0b1c] bg-[#2a2a4e] text-[9px] font-bold text-[#c8c8e0]"
                >
                  {p.avatar_initials}
                </span>
              ))}
              {participants.length > 5 && (
                <span className="grid size-7 place-items-center rounded-full border-2 border-[#0b0b1c] bg-[#191934] text-[9px] font-bold text-[#8888ac]">
                  +{participants.length - 5}
                </span>
              )}
            </div>
            <button
              onClick={copyInvite}
              aria-label="Copiar link de convite da sala"
              className="flex items-center gap-1.5 rounded-full border border-[#33335c] px-3 py-1 text-xs text-[#a0a0c0] transition-colors hover:border-[#6c5cf0] hover:text-[#f0f0f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6c5cf0]"
            >
              <Link2 className="size-3.5" aria-hidden />
              {copied ? "Link copiado!" : "Convidar"}
            </button>
            <StatusPill status={session.status} />
          </div>
        </div>

        {/* Mesa */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-4">
          {/* Wrapper maior que a mesa: assentos orbitam FORA da borda */}
          <div className="relative shrink-0" style={{ width: wrapperWidth, height: wrapperHeight }}>
            <div
              className="absolute rounded-[50%] border-2 transition-all duration-500"
              style={{
                left: SEAT_MARGIN_X,
                top: SEAT_MARGIN_Y,
                width: tableWidth,
                height: tableHeight,
                background: "linear-gradient(145deg, #1d1d3a, #111126)",
                borderColor: session.status === "revealed" ? "rgba(108,92,240,0.55)" : P.border,
                boxShadow:
                  session.status === "revealed"
                    ? "inset 0 2px 20px rgba(0,0,0,0.5), 0 0 60px rgba(108,92,240,0.25)"
                    : "inset 0 2px 20px rgba(0,0,0,0.5), 0 0 40px rgba(108,92,240,0.08)",
              }}
            >
              {session.status === "voting" && (
                <div className="poker-glow pointer-events-none absolute -inset-1 rounded-[50%] border border-[#6c5cf0]/40" aria-hidden />
              )}
              <div className="absolute inset-5 rounded-[50%] border border-[#6c5cf0]/10" aria-hidden />

              {/* Conteúdo central da mesa */}
              <div className="absolute inset-0 flex items-center justify-center">
                <TableCenter session={session} currentCard={currentCard} isHost={isHost} />
              </div>
            </div>

            {/* Assentos na órbita externa */}
            {participants.map((p, i) => {
              const vote = session.votes.find((v) => v.participant_id === p.user_id)
              return (
                <Seat
                  key={p.user_id}
                  participant={p}
                  hasVoted={vote?.has_voted ?? false}
                  voteValue={vote?.value ?? null}
                  revealed={session.status === "revealed"}
                  voting={session.status === "voting"}
                  index={i}
                  x={seats[i]?.x ?? 50}
                  y={seats[i]?.y ?? 50}
                />
              )
            })}
          </div>

          {/* Stats da rodada + ações do host (abaixo da mesa) */}
          <RoundPanel
            session={session}
            isHost={isHost}
            onReveal={handleReveal}
            onNextCard={handleNextCard}
            onApply={handleApply}
            applying={applyPoints.isPending}
          />

          {/* Baralho do jogador */}
          {session.status === "voting" && (
            <div className="flex flex-col items-center gap-2.5 pb-2">
              <p className="text-xs text-[#8888ac]">
                {myVote ? (
                  <>Seu voto: <b className="text-[#a99bfa]">{myVote}</b> — clique em outra carta para mudar</>
                ) : (
                  "Escolha sua carta:"
                )}
              </p>
              <VotingRow myVote={myVote} onVote={(v) => submitVote.mutate(v)} />
            </div>
          )}
        </div>
      </div>

      {/* Painel do host: fila de votação */}
      {isHost && (
        <div
          className="flex w-full flex-col border-t p-4 lg:w-80 lg:border-l lg:border-t-0"
          style={{ borderColor: P.borderSoft, background: "rgba(13,13,30,0.9)" }}
        >
          <CardSelector
            cards={allCards}
            queueIds={selectedIds}
            currentCardId={session.current_card_id}
            onSelectCard={handleSelectCard}
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

  if (sessionId) {
    return <RoomView sessionId={sessionId} userId={userId} />
  }

  return (
    <SessionListView
      workspaceId={activeWorkspaceId ?? ""}
      projects={projects}
    />
  )
}
