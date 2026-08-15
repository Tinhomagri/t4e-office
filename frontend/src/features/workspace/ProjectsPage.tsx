// Lista de todos os projetos do workspace, em tabela — como a tela
// "Espaços" do Jira.
import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { EmptyState, Input, PageHeader, Skeleton } from "@/shared/ui/primitives"
import { useSquads } from "@/features/poker/poker.hooks"
import { useProjects, useWorkspaces } from "./workspace.hooks"

const TEMPLATE_LABEL: Record<string, string> = {
  software: "Boards",
  campanha: "Campanhas",
  social: "Campanhas",
  conteudo: "Campanhas",
}

export function ProjectsPage() {
  const { activeWorkspaceId } = useWorkspaces()
  const { data: projects, isLoading } = useProjects(activeWorkspaceId)
  const { data: squads } = useSquads(activeWorkspaceId)
  const navigate = useNavigate()
  const [query, setQuery] = useState("")

  const squadName = (id: string | null) => squads?.find((s) => s.id === id)?.name ?? "—"

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = projects ?? []
    if (!q) return list
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q),
    )
  }, [projects, query])

  return (
    <div className="space-y-6">
      <PageHeader title="Projetos" subtitle="Todos os projetos do workspace" />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-paper-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar projetos..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum projeto encontrado" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-paper-200 dark:border-ink-700">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-paper-200 bg-paper-50 text-xs font-semibold uppercase tracking-wide text-paper-500 dark:border-ink-700 dark:bg-ink-800">
                <th className="px-4 py-2.5">Nome</th>
                <th className="px-4 py-2.5">Chave</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Squad</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() =>
                    navigate(
                      `/app/boards?project=${p.id}${p.template && p.template !== "software" ? "&type=marketing" : ""}`,
                    )
                  }
                  className="cursor-pointer border-b border-paper-100 last:border-0 hover:bg-paper-50 dark:border-ink-800 dark:hover:bg-ink-800"
                >
                  <td className="flex items-center gap-2.5 px-4 py-2.5">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="size-6 shrink-0 rounded object-cover" />
                    ) : (
                      <span
                        className="grid size-6 shrink-0 place-items-center rounded text-[12px] leading-none"
                        style={{ backgroundColor: p.avatar_color || undefined }}
                      >
                        {p.avatar_emoji}
                      </span>
                    )}
                    <span className="font-medium text-ink dark:text-paper">{p.name}</span>
                  </td>
                  <td className="px-4 py-2.5 text-paper-500">{p.key}</td>
                  <td className="px-4 py-2.5 text-paper-500">
                    {TEMPLATE_LABEL[p.template ?? "software"] ?? "Boards"}
                  </td>
                  <td className="px-4 py-2.5 text-paper-500">{squadName(p.squad_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
