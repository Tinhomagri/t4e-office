import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
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
} from "./poker.hooks"
import { FIBONACCI } from "./poker.types"
import type { PokerParticipant, PokerCard, PokerSession } from "./poker.types"

function cx(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(" ")
}

function seatPositions(total: number): { x: number; y: number }[] {
  return Array.from({ length: total }, (_, i) => {
    const angle = (i / total) * 2 * Math.PI - Math.PI / 2
    return {
      x: 50 + 42 * Math.cos(angle),
      y: 50 + 32 * Math.sin(angle),
    }
  })
}

function Seat({
  participant,
  hasVoted,
  voteValue,
  revealed,
  x,
  y,
}: {
  participant: PokerParticipant
  hasVoted: boolean
  voteValue: string | null
  revealed: boolean
  x: number
  y: number
}) {
  return (
    <div
      className="absolute flex flex-col items-center gap-1"
      style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)" }}
    >
      <div
        className={cx(
          "w-8 h-12 rounded-md border text-xs font-bold flex items-center justify-center transition-all duration-500",
          revealed && hasVoted
            ? "bg-[#6c5cf0] border-[#6c5cf0] text-white scale-110"
            : hasVoted
              ? "bg-[#1a1a2e] border-[#3a3a5c] text-[#e8e8f0]"
              : "bg-[#111122] border-[#2a2a44] text-[#555577]",
        )}
      >
        {revealed ? (voteValue ?? "–") : hasVoted ? "✓" : "?"}
      </div>
      <div
        className={cx(
          "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all",
          participant.is_host
            ? "border-[#6c5cf0] bg-[#6c5cf0]/20 text-[#6c5cf0]"
            : "border-[#3a3a5c] bg-[#1a1a2e] text-[#c0c0d8]",
        )}
      >
        {participant.avatar_initials}
      </div>
      <span className="text-[10px] text-[#666688] max-w-[72px] truncate text-center leading-tight">
        {participant.user_name.split(" ")[0]}
        {participant.is_host && <span className="ml-1 text-[#6c5cf0]">★</span>}
      </span>
    </div>
  )
}

function TableCenter({
  session,
  currentCard,
  isHost,
  onReveal,
  onNextCard,
}: {
  session: PokerSession
  currentCard: PokerCard | null
  isHost: boolean
  onReveal: () => void
  onNextCard: () => void
}) {
  if (session.status === "waiting") {
    return (
      <div className="text-center px-6">
        <div className="text-3xl mb-2">🃏</div>
        <p className="text-[#666688] text-sm">Aguardando o host iniciar…</p>
        {isHost && (
          <p className="text-xs text-[#444466] mt-1">Selecione os cards →</p>
        )}
      </div>
    )
  }

  if (!currentCard) {
    return <p className="text-[#555577] text-sm">Nenhum card selecionado</p>
  }

  const nums = session.votes.map((v) => parseFloat(v.value ?? "")).filter((n) => !isNaN(n))
  const avg = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : null

  return (
    <div className="text-center flex flex-col items-center gap-2 px-4 max-w-[220px]">
      <span className="text-[10px] text-[#555577] font-mono">{currentCard.ref}</span>
      <p className="text-[#e8e8f0] font-semibold text-sm leading-snug">{currentCard.title}</p>
      {session.status === "revealed" && avg && (
        <div className="text-2xl font-bold text-[#6c5cf0]">
          {avg}<span className="text-xs text-[#555577] ml-1">pts</span>
        </div>
      )}
      {session.status === "voting" && (
        <div className="text-xs text-[#555577]">
          {session.votes.filter((v) => v.has_voted).length} votaram
        </div>
      )}
      {isHost && session.status === "voting" && (
        <button
          onClick={onReveal}
          className="mt-1 px-3 py-1 text-xs rounded-md bg-[#6c5cf0] text-white hover:bg-[#5a4dd0] transition-colors"
        >
          Revelar votos
        </button>
      )}
      {isHost && session.status === "revealed" && (
        <button
          onClick={onNextCard}
          className="mt-1 px-3 py-1 text-xs rounded-md bg-[#2a2a44] text-[#c0c0d8] hover:bg-[#3a3a5c] transition-colors"
        >
          Próximo →
        </button>
      )}
    </div>
  )
}

function VotingRow({ myVote, onVote }: { myVote: string | null; onVote: (v: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap justify-center">
      {FIBONACCI.map((val) => (
        <button
          key={val}
          onClick={() => onVote(val)}
          className={cx(
            "w-12 h-16 rounded-lg border-2 font-bold text-lg transition-all duration-150",
            myVote === val
              ? "border-[#6c5cf0] bg-[#6c5cf0] text-white scale-110 shadow-[0_0_12px_rgba(108,92,240,0.5)]"
              : "border-[#3a3a5c] bg-[#1a1a2e] text-[#c0c0d8] hover:border-[#6c5cf0] hover:scale-105",
          )}
        >
          {val}
        </button>
      ))}
    </div>
  )
}

function CardSelector({
  cards,
  selectedIds,
  currentCardId,
  sessionStatus,
  onToggle,
  onStart,
  onSelectCard,
}: {
  cards: PokerCard[]
  selectedIds: string[]
  currentCardId: string | null
  sessionStatus: string
  onToggle: (id: string) => void
  onStart: () => void
  onSelectCard: (id: string) => void
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[#888899] uppercase tracking-wider">Cards</h3>
        <span className="text-xs text-[#555577]">{selectedIds.length} selecionados</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 pr-1" style={{ scrollbarWidth: "thin" }}>
        {cards.map((card) => {
          const selected = selectedIds.includes(card.id)
          const isCurrent = card.id === currentCardId
          return (
            <div
              key={card.id}
              className={cx(
                "flex items-center gap-2 p-2 rounded-lg border transition-all",
                isCurrent
                  ? "border-[#6c5cf0] bg-[#6c5cf0]/10"
                  : selected
                    ? "border-[#3a3a5c] bg-[#1a1a2e]"
                    : "border-[#222233] bg-[#0f0f1e] opacity-60 hover:opacity-90",
              )}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(card.id)}
                className="accent-[#6c5cf0] cursor-pointer"
              />
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => selected && onSelectCard(card.id)}>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[#555577] font-mono">{card.ref}</span>
                  {card.points !== null && (
                    <span className="text-[10px] px-1 rounded bg-[#6c5cf0]/20 text-[#6c5cf0]">{card.points}</span>
                  )}
                </div>
                <p className="text-xs text-[#c0c0d8] truncate">{card.title}</p>
              </div>
              {selected && sessionStatus !== "waiting" && (
                <button
                  onClick={() => onSelectCard(card.id)}
                  className="text-[10px] px-2 py-0.5 rounded bg-[#2a2a44] text-[#888899] hover:bg-[#6c5cf0] hover:text-white transition-colors shrink-0"
                >
                  Votar
                </button>
              )}
            </div>
          )
        })}
        {cards.length === 0 && (
          <p className="text-xs text-[#444466] text-center pt-4">Nenhum card no projeto</p>
        )}
      </div>
      {sessionStatus === "waiting" && (
        <button
          disabled={selectedIds.length === 0}
          onClick={onStart}
          className="mt-3 w-full py-2 rounded-lg bg-[#6c5cf0] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#5a4dd0] transition-colors"
        >
          Iniciar sessão →
        </button>
      )}
    </div>
  )
}

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
      <div className="bg-[#111122] border border-[#2a2a44] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-[#e8e8f0] font-semibold text-lg mb-4">🃏 Nova sessão de Planning Poker</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#888899] block mb-1">Projeto</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-[#1a1a2e] border border-[#3a3a5c] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] focus:outline-none focus:border-[#6c5cf0]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>[{p.key}] {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#888899] block mb-1">Nome da sessão</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#1a1a2e] border border-[#3a3a5c] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] focus:outline-none focus:border-[#6c5cf0]"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[#888899] hover:text-[#e8e8f0] transition-colors">
            Cancelar
          </button>
          <button
            disabled={!projectId || loading}
            onClick={handleCreate}
            className="px-4 py-2 rounded-lg bg-[#6c5cf0] text-white text-sm font-semibold hover:bg-[#5a4dd0] disabled:opacity-40 transition-colors"
          >
            {loading ? "Criando…" : "Criar sala"}
          </button>
        </div>
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
    navigate(`/poker/${session.id}`)
  }

  const statusLabel: Record<string, string> = {
    waiting: "Aguardando", voting: "Votando", revealed: "Revelando", done: "Concluída",
  }

  return (
    <div className="max-w-xl mx-auto py-12 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#e8e8f0]">Planning Poker</h1>
          <p className="text-sm text-[#666688] mt-0.5">Estimativas colaborativas com seu time</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg bg-[#6c5cf0] text-white text-sm font-semibold hover:bg-[#5a4dd0] transition-colors"
        >
          + Nova sessão
        </button>
      </div>
      {sessions.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🃏</div>
          <p className="text-lg font-semibold text-[#666688]">Nenhuma sessão ativa</p>
          <p className="text-sm text-[#444466] mt-1">Crie uma sala e convide seu time para estimar cards</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-4 rounded-xl border border-[#2a2a44] bg-[#111122] hover:border-[#3a3a5c] transition-colors"
            >
              <div>
                <p className="text-[#e8e8f0] font-medium">{s.name}</p>
                <span className="text-xs text-[#666688]">{statusLabel[s.status]}</span>
              </div>
              <button
                onClick={() => navigate(`/poker/${s.id}`)}
                className="px-3 py-1.5 rounded-lg bg-[#2a2a44] text-[#c0c0d8] text-xs font-medium hover:bg-[#6c5cf0] hover:text-white transition-colors"
              >
                Entrar
              </button>
            </div>
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

function RoomView({ sessionId, userId }: { sessionId: string; userId: string }) {
  const { data: session } = useSession(sessionId)
  const { data: allCards = [] } = usePokerCards(sessionId)
  const submitVote = useSubmitVote(sessionId)
  const updateSession = useUpdateSession(sessionId)
  useHeartbeat(sessionId)

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full text-[#555577]">
        Carregando sala…
      </div>
    )
  }

  const isHost = session.created_by === userId
  const myVote = session.votes.find((v) => v.participant_id === userId)?.value ?? null
  const participants = session.participants.slice(0, 10)
  const seats = seatPositions(Math.max(participants.length, 1))
  const currentCard = allCards.find((c) => c.id === session.current_card_id) ?? null
  const selectedIds = session.card_ids

  const handleToggleCard = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    updateSession.mutate({ card_ids: next })
  }

  const handleStart = () => {
    updateSession.mutate({ status: "voting", current_card_id: selectedIds[0] ?? null })
  }

  const handleSelectCard = (id: string) => {
    updateSession.mutate({ status: "voting", current_card_id: id })
  }

  const handleReveal = () => {
    updateSession.mutate({ status: "revealed" })
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
    <div className="flex h-full" style={{ background: "#0a0a18" }}>
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#1e1e33]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🃏</span>
            <div>
              <h1 className="text-[#e8e8f0] font-semibold">{session.name}</h1>
              <p className="text-xs text-[#555577]">
                {participants.length} participante{participants.length !== 1 ? "s" : ""}
                {participants.length >= 10 && " (máx. 10)"}
              </p>
            </div>
          </div>
          <span
            className={cx(
              "text-xs px-2.5 py-0.5 rounded-full border",
              session.status === "voting"
                ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
                : session.status === "revealed"
                  ? "border-[#6c5cf0]/40 text-[#6c5cf0] bg-[#6c5cf0]/10"
                  : session.status === "done"
                    ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                    : "border-[#2a2a44] text-[#666688] bg-[#111122]",
            )}
          >
            {session.status === "waiting" && "⏳ Aguardando"}
            {session.status === "voting" && "🗳 Votação aberta"}
            {session.status === "revealed" && "✨ Votos revelados"}
            {session.status === "done" && "✅ Concluída"}
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
          <div
            className="relative rounded-[50%] border-2"
            style={{
              width: 500,
              height: 300,
              background: "linear-gradient(145deg, #1a1a2e, #111122)",
              borderColor: "#2a2a44",
              boxShadow: "inset 0 2px 20px rgba(0,0,0,0.5), 0 0 40px rgba(108,92,240,0.05)",
            }}
          >
            <div
              className="absolute inset-6 rounded-[50%]"
              style={{ background: "rgba(108,92,240,0.03)" }}
            />
            {participants.map((p, i) => {
              const vote = session.votes.find((v) => v.participant_id === p.user_id)
              return (
                <Seat
                  key={p.user_id}
                  participant={p}
                  hasVoted={vote?.has_voted ?? false}
                  voteValue={vote?.value ?? null}
                  revealed={session.status === "revealed"}
                  x={seats[i]?.x ?? 50}
                  y={seats[i]?.y ?? 50}
                />
              )
            })}
            <div className="absolute inset-0 flex items-center justify-center">
              <TableCenter
                session={session}
                currentCard={currentCard}
                isHost={isHost}
                onReveal={handleReveal}
                onNextCard={handleNextCard}
              />
            </div>
          </div>

          {session.status === "voting" && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs text-[#666688]">
                {myVote ? `Seu voto: ${myVote} — clique para mudar` : "Escolha seu voto:"}
              </p>
              <VotingRow myVote={myVote} onVote={(v) => submitVote.mutate(v)} />
            </div>
          )}

          {session.status === "revealed" && session.votes.length > 0 && (
            <div className="flex gap-3 flex-wrap justify-center max-w-lg">
              {session.votes.map((v) => (
                <div key={v.participant_id} className="flex flex-col items-center gap-1">
                  <div
                    className="w-10 h-14 rounded-lg border-2 flex items-center justify-center font-bold text-lg"
                    style={{
                      borderColor: "#6c5cf0",
                      background: "rgba(108,92,240,0.1)",
                      color: "#6c5cf0",
                    }}
                  >
                    {v.value ?? "–"}
                  </div>
                  <span className="text-[10px] text-[#555577] max-w-[60px] truncate text-center">
                    {v.participant_name.split(" ")[0]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isHost && (
        <div
          className="w-72 border-l p-4 flex flex-col"
          style={{ borderColor: "#1e1e33", background: "#0d0d1e" }}
        >
          <CardSelector
            cards={allCards}
            selectedIds={selectedIds}
            currentCardId={session.current_card_id}
            sessionStatus={session.status}
            onToggle={handleToggleCard}
            onStart={handleStart}
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

  useEffect(() => {
    if (!sessionId) return
    joinSession.mutate()
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const userId = (() => {
    try {
      const token = localStorage.getItem("access")
      if (!token) return ""
      const payload = JSON.parse(atob(token.split(".")[1]))
      return payload.user_id ?? ""
    } catch {
      return ""
    }
  })()

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
