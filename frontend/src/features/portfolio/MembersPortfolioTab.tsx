import { AlertTriangle, CheckCircle2, Layers, Sparkles, Zap } from "lucide-react"

import { ColoredAvatar } from "@/features/boards/board.shared"
import type { BoardCard } from "@/features/workspace/workspace.hooks"
import type { Member } from "@/features/workspace/workspace.types"
import { cx } from "@/shared/ui/primitives"

interface ProjectSlice {
  id: string
  key: string
  name: string
  count: number
}

interface MemberPortfolio {
  member: Member
  total: number
  done: number
  donePct: number
  pointsTotal: number
  pointsDone: number
  overdue: number
  projects: ProjectSlice[]
}

function isOverdue(c: BoardCard): boolean {
  if (!c.due_date || c.resolution === "done") return false
  const d = new Date(c.due_date + "T00:00:00")
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return d.getTime() < today.getTime()
}

function computePortfolios(members: Member[], cards: BoardCard[]): MemberPortfolio[] {
  const byMember = new Map<string, BoardCard[]>()
  for (const c of cards) {
    if (!c.assignee_id) continue
    const list = byMember.get(c.assignee_id)
    if (list) list.push(c)
    else byMember.set(c.assignee_id, [c])
  }

  return members
    .map((member) => {
      const mine = byMember.get(member.user_id) ?? []
      const total = mine.length
      const done = mine.filter((c) => c.resolution === "done").length
      const pointsTotal = mine.reduce((s, c) => s + (c.points ?? 0), 0)
      const pointsDone = mine
        .filter((c) => c.resolution === "done")
        .reduce((s, c) => s + (c.points ?? 0), 0)
      const overdue = mine.filter(isOverdue).length

      const projMap = new Map<string, ProjectSlice>()
      for (const c of mine) {
        const cur = projMap.get(c.project_id)
        if (cur) cur.count += 1
        else projMap.set(c.project_id, { id: c.project_id, key: c.projectKey, name: c.projectName, count: 1 })
      }
      const projects = [...projMap.values()].sort((a, b) => b.count - a.count)

      return {
        member,
        total,
        done,
        donePct: total ? Math.round((done / total) * 100) : 0,
        pointsTotal,
        pointsDone,
        overdue,
        projects,
      }
    })
    .sort((a, b) => b.pointsTotal - a.pointsTotal || b.total - a.total)
}

export function MembersPortfolioTab({ members, cards }: { members: Member[]; cards: BoardCard[] }) {
  const rows = computePortfolios(members, cards)
  const active = rows.filter((r) => r.total > 0)
  const idle = rows.filter((r) => r.total === 0)

  if (members.length === 0) {
    return (
      <div className="surface p-10 text-center">
        <p className="text-sm font-medium text-ink dark:text-paper">Nenhum integrante neste workspace.</p>
        <p className="mt-1 text-sm text-paper-500">Convide pessoas em Membros para ver a carga de cada uma aqui.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.map((r) => (
          <MemberCard key={r.member.user_id} row={r} />
        ))}
      </div>

      {idle.length > 0 && (
        <div className="surface p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-paper-400">
            Sem cards atribuídos ({idle.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {idle.map((r) => (
              <span
                key={r.member.user_id}
                className="inline-flex items-center gap-1.5 rounded-full bg-paper-50 px-2.5 py-1 text-xs text-paper-500 dark:bg-ink-900"
              >
                <ColoredAvatar name={r.member.name} size="xs" />
                {r.member.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MemberCard({ row }: { row: MemberPortfolio }) {
  const { member, total, done, donePct, pointsTotal, pointsDone, overdue, projects } = row
  return (
    <div className="surface relative overflow-hidden p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 to-brand-700"
      />

      <div className="flex items-center gap-3">
        <ColoredAvatar name={member.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink dark:text-paper">{member.name}</p>
          <p className="truncate text-[11px] text-paper-400">{member.email}</p>
        </div>
        {overdue > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
            <AlertTriangle className="size-3" />
            {overdue}
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-paper-500">Concluído (peso)</span>
          <span className="font-medium text-ink dark:text-paper tabular">{donePct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
            style={{ width: `${donePct}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Mini icon={Layers} label="Cards" value={total} />
        <Mini icon={CheckCircle2} label="Feitos" value={done} />
        <Mini icon={Zap} label="Peso" value={`${pointsDone}/${pointsTotal}`} />
      </div>

      {projects.length > 0 && (
        <div className="mt-4 border-t border-paper-100 pt-3 dark:border-ink-800">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-paper-400">
            <Sparkles className="size-3" /> Em {projects.length} projeto{projects.length > 1 ? "s" : ""}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {projects.slice(0, 5).map((p) => (
              <span
                key={p.id}
                className="rounded-full bg-paper-50 px-2 py-0.5 font-mono text-[10px] text-paper-500 dark:bg-ink-900"
                title={p.name}
              >
                {p.key} · {p.count}
              </span>
            ))}
            {projects.length > 5 && (
              <span className="rounded-full bg-paper-50 px-2 py-0.5 text-[10px] text-paper-400 dark:bg-ink-900">
                +{projects.length - 5}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Mini({ icon: Icon, label, value }: { icon: typeof Layers; label: string; value: number | string }) {
  return (
    <div className={cx("rounded-lg bg-paper-50 py-2 dark:bg-ink-900")}>
      <p className="flex items-center justify-center gap-1 text-sm font-bold tabular text-ink dark:text-paper">
        <Icon className="size-3.5 text-paper-400" />
        {value}
      </p>
      <p className="text-[10px] text-paper-500">{label}</p>
    </div>
  )
}
