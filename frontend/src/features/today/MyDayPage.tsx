import { CalendarCheck, CircleDot, LayoutDashboard, Loader2, Sparkles } from "lucide-react"
import { Link } from "react-router-dom"

import { useAuthStore } from "@/features/auth/auth.store"
import {
  useWorkspaceCards,
  useWorkspaces,
  type BoardCard,
} from "@/features/workspace/workspace.hooks"
import type { CardPriority, CardStatus } from "@/features/workspace/workspace.types"
import { Badge, PageHeader, cx } from "@/shared/ui/primitives"

const STATUS_LABEL: Record<CardStatus, string> = {
  backlog: "Backlog",
  todo: "A fazer",
  doing: "Em andamento",
  review: "Em revisão",
  done: "Concluído",
}
const PRIORITY_BAR: Record<CardPriority, string> = {
  low: "bg-paper-300",
  medium: "bg-brand-400",
  high: "bg-warning",
  urgent: "bg-danger",
}
const ACTIVE: CardStatus[] = ["todo", "doing", "review"]

export function MyDayPage() {
  const user = useAuthStore((s) => s.user)
  const { activeWorkspaceId } = useWorkspaces()
  const { cards, isLoading } = useWorkspaceCards(activeWorkspaceId)

  const mine = cards.filter((c) => c.assignee_id === user?.id)
  const myActive = mine.filter((c) => ACTIVE.includes(c.status))
  const inProgress = mine.filter((c) => c.status === "doing")
  const review = mine.filter((c) => c.status === "review")
  const doneCount = mine.filter((c) => c.status === "done").length
  const points = myActive.reduce((s, c) => s + (c.points ?? 0), 0)

  const firstName = user?.full_name?.split(/\s+/)[0] ?? "você"

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <LayoutDashboard className="size-4 text-brand-500" />
            <span>Meu Dia</span>
          </>
        }
        title={`Bom te ver, ${firstName}`}
        subtitle="Seus cards e o que precisa da sua atenção agora."
      />

      {isLoading ? (
        <Center>
          <Loader2 className="size-6 animate-spin text-paper-400" />
        </Center>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Atribuídos a você" value={myActive.length} hint="cards ativos" />
            <Stat label="Em andamento" value={inProgress.length} />
            <Stat label="Aguardando revisão" value={review.length} />
            <Stat label="Pontos em aberto" value={points} hint="story points" />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel
              title="Em andamento"
              icon={<CircleDot className="size-4 text-brand-500" />}
              cards={inProgress}
              empty="Nada em andamento agora."
            />
            <Panel
              title="A fazer"
              icon={<CalendarCheck className="size-4 text-paper-500" />}
              cards={mine.filter((c) => c.status === "todo")}
              empty="Sua fila de 'a fazer' está limpa."
            />
            <Panel
              title="Em revisão"
              icon={<Sparkles className="size-4 text-warning" />}
              cards={review}
              empty="Nenhum card seu em revisão."
            />
          </div>

          {mine.length === 0 && (
            <div className="surface p-8 text-center">
              <p className="text-sm font-medium text-ink">Nenhum card atribuído a você ainda.</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-paper-500">
                Abra um board, crie cards e atribua a si mesmo para vê-los aqui.
              </p>
              <Link
                to="/app/boards"
                className="mt-4 inline-flex rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-brand-glow transition-colors hover:bg-brand-600"
              >
                Ir para os boards
              </Link>
            </div>
          )}

          {doneCount > 0 && (
            <p className="text-center text-xs text-paper-500">
              ✓ {doneCount} card(s) seus já concluídos neste workspace.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="surface p-4">
      <p className="text-[26px] font-bold leading-none text-ink tabular">{value}</p>
      <p className="mt-2 text-[13px] font-medium text-ink">{label}</p>
      {hint && <p className="text-xs text-paper-500">{hint}</p>}
    </div>
  )
}

function Panel({
  title,
  icon,
  cards,
  empty,
}: {
  title: string
  icon: React.ReactNode
  cards: BoardCard[]
  empty: string
}) {
  return (
    <div className="surface flex flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-paper-100 px-1.5 text-[11px] font-medium text-paper-600">
          {cards.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {cards.map((c) => (
          <Link
            key={c.id}
            to="/app/boards"
            className="group relative overflow-hidden rounded-xl border border-paper-200 bg-paper p-3 transition-shadow hover:shadow-card"
          >
            <span className={cx("absolute inset-y-0 left-0 w-1", PRIORITY_BAR[c.priority])} />
            <div className="flex items-center justify-between gap-2 pl-1.5">
              <span className="font-mono text-[11px] text-paper-400 tabular">{c.ref}</span>
              <Badge tone="neutral">{STATUS_LABEL[c.status]}</Badge>
            </div>
            <p className="mt-1 pl-1.5 text-sm text-ink">{c.title}</p>
            <p className="mt-1 pl-1.5 text-[11px] text-paper-400">{c.projectName}</p>
          </Link>
        ))}
        {cards.length === 0 && (
          <p className="rounded-xl border border-dashed border-paper-200 py-6 text-center text-xs text-paper-400">
            {empty}
          </p>
        )}
      </div>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid place-items-center py-20">{children}</div>
}
