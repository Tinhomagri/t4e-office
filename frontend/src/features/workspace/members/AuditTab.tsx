import { useMemo } from "react"
import { ArrowRight, ShieldCheck, UserMinus } from "lucide-react"

import { EmptyState, Spinner } from "@/shared/ui/primitives"

import { useAuditLog, useMembers } from "../workspace.hooks"
import type { AuditLogEntry, Role } from "../workspace.types"
import { Panel, WORKSPACE_ROLE_LABEL } from "./shared"

function roleLabel(raw: string): string {
  return WORKSPACE_ROLE_LABEL[raw as Role] ?? (raw || "—")
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AuditTab({
  workspaceId,
  canView,
}: {
  workspaceId: string
  canView: boolean
}) {
  const audit = useAuditLog(workspaceId, canView)
  const members = useMembers(workspaceId)

  // Mapa id → nome, para exibir nomes em vez de UUIDs no log.
  const nameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const m of members.data ?? []) map[m.user_id] = m.name
    return map
  }, [members.data])

  const nameOf = (id: string) => nameById[id] ?? id.slice(0, 8)

  if (!canView) {
    return (
      <EmptyState
        title="Acesso restrito"
        description="Apenas dono ou administrador podem ver o log de auditoria."
      />
    )
  }

  if (audit.isLoading) {
    return (
      <div className="grid place-items-center py-14">
        <Spinner />
      </div>
    )
  }

  const entries = audit.data ?? []
  if (entries.length === 0) {
    return (
      <EmptyState
        title="Sem atividade"
        description="Mudanças de papel e remoções de membros aparecerão aqui."
      />
    )
  }

  return (
    <Panel className="p-2">
      <ul className="divide-y divide-ink/5 dark:divide-ink-700">
        {entries.map((e) => (
          <AuditRow key={e.id} entry={e} nameOf={nameOf} />
        ))}
      </ul>
    </Panel>
  )
}

function AuditRow({
  entry,
  nameOf,
}: {
  entry: AuditLogEntry
  nameOf: (id: string) => string
}) {
  const removed = entry.action === "member_removed"
  return (
    <li className="flex items-start gap-3 px-3 py-3">
      <div
        className={
          removed
            ? "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-danger/10 text-danger"
            : "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-300"
        }
      >
        {removed ? (
          <UserMinus className="size-4" />
        ) : (
          <ShieldCheck className="size-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink dark:text-paper">
          <span className="font-medium">{nameOf(entry.actor_id)}</span>{" "}
          {removed ? "removeu" : "alterou o papel de"}{" "}
          <span className="font-medium">{nameOf(entry.target_user_id)}</span>
        </p>
        {!removed && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-paper-500">
            {roleLabel(entry.old_role)}
            <ArrowRight className="size-3" />
            <span className="font-medium text-paper-600">
              {roleLabel(entry.new_role)}
            </span>
          </p>
        )}
        <p className="mt-0.5 text-xs text-paper-400">{formatWhen(entry.created_at)}</p>
      </div>
    </li>
  )
}
