import { useState } from "react"

import { PageHeader } from "@/shared/ui/primitives"
import {
  useInvitations,
  useInvite,
  useMembers,
  useRevokeInvite,
  useWorkspaces,
} from "./workspace.hooks"
import type { Role } from "./workspace.types"

export function MembersPage() {
  const { data: workspaces, isLoading, activeWorkspaceId } = useWorkspaces()

  if (isLoading) return <Centered>Carregando…</Centered>
  if (!workspaces || workspaces.length === 0 || !activeWorkspaceId)
    return <Centered>Crie um workspace na aba Boards primeiro.</Centered>

  return <MembersInner workspaceId={activeWorkspaceId} />
}

function MembersInner({ workspaceId }: { workspaceId: string }) {
  const members = useMembers(workspaceId)
  const invitations = useInvitations(workspaceId)
  const invite = useInvite(workspaceId)
  const revoke = useRevokeInvite(workspaceId)

  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("member")
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleInvite = async () => {
    setFeedback(null)
    try {
      await invite.mutateAsync({ email, role })
      setEmail("")
      setFeedback("Convite enviado!")
    } catch (e) {
      setFeedback(errMsg(e))
    }
  }

  const pending = (invitations.data ?? []).filter((i) => i.status === "pending")

  return (
    <div className="space-y-6">
      <PageHeader title="Membros" subtitle="Equipe e convites do workspace" />

      <section className="rounded-2xl border border-ink/10 bg-paper dark:bg-ink-900 p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink dark:text-paper">Convidar pessoa</h3>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@empresa.com"
            className="min-w-[220px] flex-1 rounded-lg border border-ink/15 bg-paper-100 dark:bg-ink-800 px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-lg border border-ink/15 bg-paper-100 dark:bg-ink-800 px-3 py-2 text-sm"
          >
            <option value="member">Membro</option>
            <option value="admin">Admin</option>
          </select>
          <button
            disabled={!email || invite.isPending}
            onClick={handleInvite}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
          >
            Convidar
          </button>
        </div>
        {feedback && <p className="mt-2 text-xs text-paper-600">{feedback}</p>}
      </section>

      <section className="rounded-2xl border border-ink/10 bg-paper dark:bg-ink-900 p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink dark:text-paper">
          Membros ({members.data?.length ?? 0})
        </h3>
        <ul className="divide-y divide-ink/5">
          {(members.data ?? []).map((m) => (
            <li key={m.user_id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm text-ink dark:text-paper">{m.name}</p>
                <p className="text-xs text-paper-500">{m.email}</p>
              </div>
              <span className="rounded bg-ink/5 px-2 py-0.5 text-xs uppercase text-paper-600">
                {m.role}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {pending.length > 0 && (
        <section className="rounded-2xl border border-ink/10 bg-paper dark:bg-ink-900 p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink dark:text-paper">
            Convites pendentes ({pending.length})
          </h3>
          <ul className="divide-y divide-ink/5">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-ink dark:text-paper">{i.email}</p>
                  <p className="text-xs text-paper-500">{i.role}</p>
                </div>
                <button
                  onClick={() => revoke.mutate(i.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Revogar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="py-16 text-center text-sm text-paper-500">{children}</div>
}

function errMsg(e: unknown): string {
  const anyE = e as { response?: { data?: { error?: string; detail?: string } } }
  return (
    anyE?.response?.data?.error ??
    anyE?.response?.data?.detail ??
    "Não foi possível concluir."
  )
}
