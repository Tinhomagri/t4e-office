import { useMemo, useState } from "react"
import { Mail, Trash2, UserPlus } from "lucide-react"

import { useAuthStore } from "@/features/auth/auth.store"
import { toast } from "@/shared/ui/toast"
import { useSquads } from "@/features/poker/poker.hooks"
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Select,
  Spinner,
} from "@/shared/ui/primitives"

import { ColoredAvatar } from "@/features/boards/board.shared"
import {
  useInvitations,
  useInvite,
  useMembers,
  useRemoveMember,
  useRevokeInvite,
  useUpdateMemberRole,
  useUpdateMemberSpaces,
} from "../workspace.hooks"
import type { Member, Role } from "../workspace.types"
import {
  errMsg,
  Panel,
  WORKSPACE_ROLE_LABEL,
} from "./shared"
import { SPACES, type SpaceId } from "@/features/shell/spaces"

const SPACE_LABEL: Record<SpaceId, string> = {
  boards: "Boards",
  marketing: "Marketing",
  comercial: "Comercial",
}

const ROLE_TONE: Record<Role, "brand" | "warning" | "neutral"> = {
  owner: "brand",
  admin: "warning",
  member: "neutral",
}

export function MembersTab({ workspaceId }: { workspaceId: string }) {
  const me = useAuthStore((s) => s.user)
  const members = useMembers(workspaceId)
  const invitations = useInvitations(workspaceId)
  const invite = useInvite(workspaceId)
  const revoke = useRevokeInvite(workspaceId)
  const updateRole = useUpdateMemberRole(workspaceId)
  const updateSpaces = useUpdateMemberSpaces(workspaceId)
  const removeMember = useRemoveMember(workspaceId)

  const [email, setEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<Role>("member")

  const list = members.data ?? []
  const myRole = useMemo(
    () => list.find((m) => m.user_id === me?.id)?.role ?? null,
    [list, me?.id],
  )
  const canManage = myRole === "owner" || myRole === "admin"
  const ownersCount = list.filter((m) => m.role === "owner").length
  // Uma pessoa pode estar em mais de uma squad — é comum quem atua em duas
  // frentes participar das duas estimativas.
  const { data: squads = [] } = useSquads(workspaceId)
  const squadDe = (userId: string) =>
    squads.filter((sq) => sq.members.some((m) => m.user_id === userId))

  const pending = (invitations.data ?? []).filter((i) => i.status === "pending")

  const handleInvite = async () => {
    if (!email) return
    try {
      await invite.mutateAsync({ email, role: inviteRole })
      setEmail("")
      toast.success("Convite enviado")
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  const handleRoleChange = async (m: Member, role: Role) => {
    try {
      await updateRole.mutateAsync({ userId: m.user_id, role })
      toast.success(`Papel de ${m.name} atualizado`)
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  // null = irrestrito (todos marcados). Desmarcar o primeiro box é o que faz
  // a transição de "irrestrito" pra "lista explícita" — sem toggle separado.
  const handleSpaceToggle = async (m: Member, spaceId: SpaceId, checked: boolean) => {
    const current = m.allowed_spaces ?? SPACES.map((s) => s.id)
    const next = checked
      ? Array.from(new Set([...current, spaceId]))
      : current.filter((id) => id !== spaceId)
    try {
      await updateSpaces.mutateAsync({ userId: m.user_id, allowedSpaces: next })
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  const handleRemove = async (m: Member) => {
    if (!window.confirm(`Remover ${m.name} do workspace?`)) return
    try {
      await removeMember.mutateAsync(m.user_id)
      toast.success(`${m.name} removido`)
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  // Regras espelhando os guards do backend, para desabilitar controles proativamente.
  const roleLocked = (m: Member): string | null => {
    if (!canManage) return "Apenas dono ou admin podem alterar papéis."
    if (m.user_id === me?.id) return "Você não pode alterar o próprio papel."
    if (myRole === "admin" && m.role === "owner")
      return "Admin não pode alterar o papel de um dono."
    return null
  }
  const removeLocked = (m: Member): string | null => {
    if (!canManage) return "Apenas dono ou admin podem remover membros."
    if (myRole === "admin" && m.role === "owner") return "Admin não pode remover um dono."
    if (m.role === "owner" && ownersCount <= 1)
      return "Não é possível remover o único dono."
    return null
  }

  return (
    <div className="space-y-6">
      {/* Convite */}
      {canManage && (
        <Panel className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink dark:text-paper">
            <UserPlus className="size-4 text-paper-400" />
            Convidar pessoa
          </h3>
          <div className="flex flex-wrap gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              placeholder="email@empresa.com"
              className="min-w-[240px] flex-1"
            />
            <Select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="max-w-[180px]"
            >
              <option value="member">Membro</option>
              <option value="admin">Administrador</option>
            </Select>
            <Button
              onClick={handleInvite}
              loading={invite.isPending}
              disabled={!email}
              icon={<Mail className="size-4" />}
            >
              Convidar
            </Button>
          </div>
        </Panel>
      )}

      {/* Membros */}
      <Panel>
        <div className="flex items-center justify-between border-b border-ink/5 dark:border-ink-700 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-ink dark:text-paper">
            Membros{" "}
            <span className="text-paper-400">({list.length})</span>
          </h3>
        </div>

        {members.isLoading ? (
          <div className="grid place-items-center py-14">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <EmptyState title="Nenhum membro" className="m-4" />
        ) : (
          <ul className="divide-y divide-ink/5 dark:divide-ink-700">
            {list.map((m) => {
              const rLock = roleLocked(m)
              const dLock = removeLocked(m)
              const isMe = m.user_id === me?.id
              return (
                <li
                  key={m.user_id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <ColoredAvatar name={m.name} userId={m.user_id} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink dark:text-paper">
                      {m.name}
                      {isMe && (
                        <span className="ml-1.5 text-xs font-normal text-paper-400">
                          (você)
                        </span>
                      )}
                    </p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-paper-500">
                      {m.email}
                      {/* Squad é etiqueta, não divisão: mostra a que time a
                          pessoa estima junto, sem mudar o que ela enxerga. */}
                      {squadDe(m.user_id).map((sq) => (
                        <span
                          key={sq.id}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: `${sq.color}22`, color: sq.color }}
                        >
                          <span className="size-1.5 rounded-full" style={{ backgroundColor: sq.color }} />
                          {sq.name}
                        </span>
                      ))}
                    </p>
                  </div>

                  {/* Spaces que o membro enxerga — só faz sentido pra role
                      "member": owner/admin sempre veem tudo. */}
                  {canManage && m.role === "member" && (
                    <div className="flex shrink-0 items-center gap-2.5">
                      {SPACES.map((s) => {
                        const checked = m.allowed_spaces == null || m.allowed_spaces.includes(s.id)
                        return (
                          <label
                            key={s.id}
                            className="flex cursor-pointer items-center gap-1 text-[11px] text-paper-500"
                            title={SPACE_LABEL[s.id]}
                          >
                            <input
                              type="checkbox"
                              className="size-3.5 accent-brand-500 focus-ring"
                              checked={checked}
                              onChange={(e) => handleSpaceToggle(m, s.id, e.target.checked)}
                            />
                            {SPACE_LABEL[s.id]}
                          </label>
                        )
                      })}
                    </div>
                  )}

                  {rLock ? (
                    <Badge tone={ROLE_TONE[m.role]} className="capitalize">
                      {WORKSPACE_ROLE_LABEL[m.role]}
                    </Badge>
                  ) : (
                    <Select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m, e.target.value as Role)}
                      className="max-w-[170px]"
                    >
                      <option value="owner">Dono</option>
                      <option value="admin">Administrador</option>
                      <option value="member">Membro</option>
                    </Select>
                  )}

                  <button
                    onClick={() => handleRemove(m)}
                    disabled={!!dLock}
                    title={dLock ?? "Remover membro"}
                    className="grid size-8 place-items-center rounded-lg text-paper-400 transition-colors hover:bg-danger/10 hover:text-danger disabled:pointer-events-none disabled:opacity-30"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      {/* Convites pendentes */}
      {pending.length > 0 && (
        <Panel>
          <div className="border-b border-ink/5 dark:border-ink-700 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-ink dark:text-paper">
              Convites pendentes{" "}
              <span className="text-paper-400">({pending.length})</span>
            </h3>
          </div>
          <ul className="divide-y divide-ink/5 dark:divide-ink-700">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                <div className="grid size-9 place-items-center rounded-full bg-paper-100 dark:bg-ink-800 text-paper-400">
                  <Mail className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink dark:text-paper">{i.email}</p>
                  <p className="text-xs text-paper-500">
                    {WORKSPACE_ROLE_LABEL[i.role]} · aguardando aceite
                  </p>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke.mutate(i.id)}
                    className="text-danger"
                  >
                    Revogar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
