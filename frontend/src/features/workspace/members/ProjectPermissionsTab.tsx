import { useState } from "react"
import { useQueries, useQueryClient } from "@tanstack/react-query"
import { Globe2, Lock, RotateCcw, Trash2 } from "lucide-react"

import { toast } from "@/shared/ui/toast"
import { EmptyState, Spinner, cx } from "@/shared/ui/primitives"

import { ColoredAvatar } from "@/features/boards/board.shared"
import * as wsApi from "../workspace.api"
import { useProjects, useUpdateProject } from "../workspace.hooks"
import type {
  Project,
  ProjectAccessMember,
  ProjectRoleSlug,
} from "../workspace.types"
import { useSquads } from "@/features/poker/poker.hooks"
import type { Squad } from "@/features/poker/poker.types"
import {
  errMsg,
  Panel,
  PROJECT_ROLE_LABEL,
  PROJECT_ROLE_OPTIONS,
} from "./shared"

// Squad dona + visibilidade de um board, editável direto no cabeçalho da
// matriz — é onde a permissão nasce, não faz sentido morar em outra tela.
function ProjectAccessControl({ project, squads }: { project: Project; squads: Squad[] }) {
  const update = useUpdateProject(project.id)

  const setVisibility = (visibility: "restricted" | "workspace") => {
    if (visibility === project.visibility) return
    update.mutate(
      { visibility },
      {
        onError: (e) => toast.error(errMsg(e)),
      },
    )
  }

  const setSquad = (squadId: string) => {
    update.mutate(
      { squad_id: squadId || null },
      {
        onError: (e) => toast.error(errMsg(e)),
      },
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setVisibility("restricted")}
          title="Restrito: só squad dona e convidados"
          className={cx(
            "grid size-6 place-items-center rounded-md border",
            project.visibility === "restricted"
              ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
              : "border-paper-200 text-paper-400 dark:border-ink-700",
          )}
        >
          <Lock className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => setVisibility("workspace")}
          title="Aberto: todo o workspace vê"
          className={cx(
            "grid size-6 place-items-center rounded-md border",
            project.visibility === "workspace"
              ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
              : "border-paper-200 text-paper-400 dark:border-ink-700",
          )}
        >
          <Globe2 className="size-3" />
        </button>
      </div>
      <select
        value={project.squad_id ?? ""}
        onChange={(e) => setSquad(e.target.value)}
        disabled={project.visibility === "workspace"}
        className="rounded-md border border-paper-300 bg-paper px-1.5 py-1 text-[11px] text-paper-600 disabled:opacity-40 dark:border-ink-700 dark:bg-ink-900"
      >
        <option value="">Sem squad dona</option>
        {squads.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  )
}

export function ProjectPermissionsTab({ workspaceId }: { workspaceId: string }) {
  const projects = useProjects(workspaceId)
  const projectList = projects.data ?? []
  const squads = useSquads(workspaceId).data ?? []

  // Uma query de acesso por projeto (fan-out) — cada uma devolve todos os membros.
  const accessQueries = useQueries({
    queries: projectList.map((p) => ({
      queryKey: ["project-access", p.id],
      queryFn: () => wsApi.getProjectAccess(p.id),
    })),
  })

  const qc = useQueryClient()
  const [saving, setSaving] = useState<string | null>(null) // `${projectId}:${userId}`

  if (projects.isLoading) {
    return (
      <div className="grid place-items-center py-14">
        <Spinner />
      </div>
    )
  }

  if (projectList.length === 0) {
    return (
      <EmptyState
        title="Nenhum projeto"
        description="Crie um projeto na aba Boards para gerenciar permissões por projeto."
      />
    )
  }

  const loading = accessQueries.some((q) => q.isLoading)

  // Deriva a lista de membros a partir do primeiro acesso carregado
  // (todas as queries devolvem o mesmo conjunto de membros do workspace).
  const firstLoaded = accessQueries.find((q) => q.data)?.data ?? []
  const members = firstLoaded

  // Mapa (projectId → (userId → item)) para lookup O(1) das células.
  const cellByProject: Record<string, Record<string, ProjectAccessMember>> = {}
  projectList.forEach((p, i) => {
    const data = accessQueries[i]?.data ?? []
    cellByProject[p.id] = Object.fromEntries(data.map((m) => [m.user_id, m]))
  })

  const invalidate = (projectId: string) =>
    qc.invalidateQueries({ queryKey: ["project-access", projectId] })

  const handleAssign = async (
    project: Project,
    member: ProjectAccessMember,
    role: ProjectRoleSlug,
  ) => {
    const key = `${project.id}:${member.user_id}`
    setSaving(key)
    try {
      await wsApi.assignProjectRole(project.id, member.user_id, role)
      await invalidate(project.id)
      toast.success(`${member.name} → ${PROJECT_ROLE_LABEL[role]} em ${project.key}`)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setSaving(null)
    }
  }

  const handleReset = async (project: Project, member: ProjectAccessMember) => {
    const key = `${project.id}:${member.user_id}`
    setSaving(key)
    try {
      await wsApi.resetProjectRole(project.id, member.user_id)
      await invalidate(project.id)
      toast.success(`Papel de ${member.name} em ${project.key} voltou ao derivado`)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setSaving(null)
    }
  }

  const handleToggleDelete = async (
    project: Project,
    member: ProjectAccessMember,
    enabled: boolean,
  ) => {
    const key = `${project.id}:${member.user_id}:delete`
    setSaving(key)
    try {
      await wsApi.setCardDeleteGrant(project.id, member.user_id, enabled)
      await invalidate(project.id)
      toast.success(
        enabled
          ? `${member.name} agora pode deletar cards em ${project.key}`
          : `${member.name} não pode mais deletar cards em ${project.key}`,
      )
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-paper-500">
        Papel de cada membro por projeto. Quando não há papel explícito, ele é{" "}
        <span className="font-medium text-paper-600">derivado</span> do papel de
        workspace — restaure com o botão ↺.
      </p>

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 dark:border-ink-700">
                <th className="sticky left-0 z-10 bg-paper dark:bg-ink-900 px-4 py-3 text-left font-semibold text-ink dark:text-paper">
                  Membro
                </th>
                {projectList.map((p) => (
                  <th
                    key={p.id}
                    className="min-w-[190px] px-4 py-3 text-left font-semibold text-ink dark:text-paper"
                  >
                    <span className="rounded bg-ink/5 dark:bg-ink-700 px-1.5 py-0.5 text-xs font-mono uppercase text-paper-600">
                      {p.key}
                    </span>{" "}
                    <span className="text-paper-500">{p.name}</span>
                  </th>
                ))}
              </tr>
              <tr className="border-b border-ink/10 dark:border-ink-700">
                <th className="sticky left-0 z-10 bg-paper dark:bg-ink-900 px-4 py-2 text-left text-xs font-normal text-paper-500">
                  Squad dona / visibilidade
                </th>
                {projectList.map((p) => (
                  <th key={p.id} className="px-4 py-2 text-left font-normal">
                    <ProjectAccessControl project={p} squads={squads} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && members.length === 0 ? (
                <tr>
                  <td
                    colSpan={projectList.length + 1}
                    className="px-4 py-10 text-center"
                  >
                    <Spinner />
                  </td>
                </tr>
              ) : (
                members.map((mem) => (
                  <tr
                    key={mem.user_id}
                    className="border-b border-ink/5 dark:border-ink-700 last:border-0"
                  >
                    <td className="sticky left-0 z-10 bg-paper dark:bg-ink-900 px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <ColoredAvatar name={mem.name} userId={mem.user_id} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink dark:text-paper">
                            {mem.name}
                          </p>
                          <p className="truncate text-xs text-paper-500">
                            {mem.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    {projectList.map((p) => {
                      const cell = cellByProject[p.id]?.[mem.user_id]
                      const key = `${p.id}:${mem.user_id}`
                      const isSaving = saving === key
                      const explicit = !!cell?.explicit_role
                      const value = cell?.project_role ?? "developer"
                      const isAdmin = value === "admin"
                      const canDelete = isAdmin || !!cell?.can_delete_cards
                      const deleteSaving = saving === `${p.id}:${mem.user_id}:delete`
                      return (
                        <td key={p.id} className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={value}
                              disabled={isSaving}
                              onChange={(e) =>
                                cell &&
                                handleAssign(
                                  p,
                                  cell,
                                  e.target.value as ProjectRoleSlug,
                                )
                              }
                              className={cx(
                                "rounded-lg border px-2 py-1.5 text-xs transition-colors focus-ring disabled:opacity-50",
                                explicit
                                  ? "border-brand-400/60 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 font-medium"
                                  : "border-paper-300 dark:border-ink-700 bg-paper dark:bg-ink-900 text-paper-500",
                              )}
                              title={
                                explicit
                                  ? "Papel explícito neste projeto"
                                  : "Derivado do papel de workspace"
                              }
                            >
                              {PROJECT_ROLE_OPTIONS.map((r) => (
                                <option key={r} value={r}>
                                  {PROJECT_ROLE_LABEL[r]}
                                </option>
                              ))}
                            </select>
                            {explicit && (
                              <button
                                onClick={() => cell && handleReset(p, cell)}
                                disabled={isSaving}
                                title="Voltar ao papel derivado"
                                className="grid size-7 shrink-0 place-items-center rounded-md text-paper-400 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper disabled:opacity-30"
                              >
                                <RotateCcw className="size-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() =>
                                cell && handleToggleDelete(p, cell, !canDelete)
                              }
                              disabled={isAdmin || deleteSaving}
                              title={
                                isAdmin
                                  ? "Admin sempre pode deletar cards"
                                  : canDelete
                                    ? "Pode deletar cards — clique pra revogar"
                                    : "Não pode deletar cards — clique pra liberar"
                              }
                              className={cx(
                                "grid size-7 shrink-0 place-items-center rounded-md disabled:opacity-30",
                                canDelete
                                  ? "text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                                  : "text-paper-300 dark:text-ink-600 hover:bg-paper-100 dark:hover:bg-ink-800",
                              )}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
