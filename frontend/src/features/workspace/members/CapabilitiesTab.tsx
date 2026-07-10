import { useEffect, useState } from "react"
import { Check, Minus } from "lucide-react"

import { EmptyState, Select, Spinner } from "@/shared/ui/primitives"

import { usePermissionScheme, useProjects } from "../workspace.hooks"
import { CAPABILITY_LABEL, Panel, PROJECT_ROLE_LABEL } from "./shared"
import type { ProjectRoleSlug } from "../workspace.types"

export function CapabilitiesTab({ workspaceId }: { workspaceId: string }) {
  const projects = useProjects(workspaceId)
  const projectList = projects.data ?? []
  const [projectId, setProjectId] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId && projectList.length > 0) setProjectId(projectList[0]!.id)
  }, [projectId, projectList])

  const scheme = usePermissionScheme(projectId)

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
        description="A matriz de capacidades é definida por projeto."
      />
    )
  }

  const roles = scheme.data?.roles ?? []
  const allCaps = scheme.data?.all_capabilities ?? []
  const hasCap = (roleSlug: ProjectRoleSlug, cap: string) =>
    roles.find((r) => r.slug === roleSlug)?.capabilities.includes(cap as never) ?? false

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-paper-500">
          O que cada papel de projeto pode fazer. Definido pelo esquema de
          permissões (somente leitura).
        </p>
        <Select
          value={projectId ?? ""}
          onChange={(e) => setProjectId(e.target.value)}
          className="max-w-[240px]"
        >
          {projectList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.key} · {p.name}
            </option>
          ))}
        </Select>
      </div>

      <Panel className="overflow-hidden">
        {scheme.isLoading ? (
          <div className="grid place-items-center py-14">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 dark:border-ink-700">
                  <th className="sticky left-0 bg-paper dark:bg-ink-900 px-4 py-3 text-left font-semibold text-ink dark:text-paper">
                    Capacidade
                  </th>
                  {roles.map((r) => (
                    <th
                      key={r.slug}
                      className="px-4 py-3 text-center font-semibold text-ink dark:text-paper"
                    >
                      {PROJECT_ROLE_LABEL[r.slug]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allCaps.map((cap) => (
                  <tr
                    key={cap}
                    className="border-b border-ink/5 dark:border-ink-700 last:border-0"
                  >
                    <td className="sticky left-0 bg-paper dark:bg-ink-900 px-4 py-2.5 text-ink dark:text-paper">
                      {CAPABILITY_LABEL[cap] ?? cap}
                    </td>
                    {roles.map((r) => (
                      <td key={r.slug} className="px-4 py-2.5 text-center">
                        {hasCap(r.slug, cap) ? (
                          <Check className="mx-auto size-4 text-success" />
                        ) : (
                          <Minus className="mx-auto size-4 text-paper-300" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
