// Página de configuração do quadro — espelha o "Configurações do espaço" do Jira,
// com uma sidebar de abas à esquerda e o painel da aba ativa à direita.
import { useMemo } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, Columns3, LayoutGrid, SlidersHorizontal } from "lucide-react"

import {
  useProject,
  useProjectAccess,
  useProjectPermissions,
} from "@/features/workspace/workspace.hooks"
import { Badge, Spinner, cx } from "@/shared/ui/primitives"

import { BoardTab } from "./BoardTab"
import { ColumnsTab } from "./ColumnsTab"
import { GeneralTab } from "./GeneralTab"

const TABS = [
  { id: "geral", label: "Geral", icon: SlidersHorizontal },
  { id: "colunas", label: "Colunas", icon: Columns3 },
  { id: "quadro", label: "Quadro", icon: LayoutGrid },
] as const

type TabId = (typeof TABS)[number]["id"]

export function BoardSettingsPage() {
  const { projectId = "" } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  // A aba vive na URL para o link ser compartilhável e o voltar do browser funcionar.
  const raw = params.get("tab")
  const active: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : "geral"

  const { data: project, isLoading, isError } = useProject(projectId)
  const { data: access } = useProjectAccess(projectId)
  const { can } = useProjectPermissions(projectId)

  const canAdminister = can("administer_project")
  const canManageWorkflow = can("manage_workflow")

  const members = useMemo(
    () => (access ?? []).map((m) => ({ user_id: m.user_id, name: m.name })),
    [access],
  )

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="size-7" />
      </div>
    )
  }

  if (isError || !project) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-paper-500">Projeto não encontrado.</p>
        <button
          onClick={() => navigate("/app/boards")}
          className="mt-3 text-sm font-medium text-brand-600 hover:underline"
        >
          Voltar aos quadros
        </button>
      </div>
    )
  }

  return (
    // Largura cheia com um respiro só nas laterais. `max-w` centralizado deixava
    // metade da tela vazia; sem limite nenhum os campos esticariam demais em
    // monitor ultrawide.
    <div className="w-full max-w-[1400px] space-y-3 px-2">
      {/* Cabeçalho enxuto em vez do PageHeader (título de 26px): configuração é
          tela de trabalho, o espaço tem que ir para os campos. */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/app/boards?project=${projectId}${project.template && project.template !== "software" ? "&type=marketing" : ""}`}
          className="grid size-7 shrink-0 place-items-center rounded-lg text-paper-500 transition-colors hover:bg-paper-100 hover:text-ink dark:hover:bg-ink-800 dark:hover:text-paper"
          aria-label="Voltar aos quadros"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-base font-semibold text-ink dark:text-paper">
          Configurações do quadro
        </h1>
        <span className="text-xs text-paper-500">
          {project.key} · {project.name}
        </span>
        {!canAdminister && !canManageWorkflow && <Badge tone="outline">Somente leitura</Badge>}
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <nav aria-label="Seções da configuração" className="md:w-40 md:shrink-0">
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {TABS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  aria-current={active === id ? "page" : undefined}
                  onClick={() => setParams({ tab: id }, { replace: true })}
                  className={cx(
                    "flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors focus-ring",
                    active === id
                      ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                      : "text-paper-600 hover:bg-paper-100 hover:text-ink dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-paper",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          {active === "geral" && (
            <GeneralTab projectId={projectId} members={members} canEdit={canAdminister} />
          )}
          {active === "colunas" && (
            <ColumnsTab projectId={projectId} canEdit={canManageWorkflow} />
          )}
          {active === "quadro" && (
            <BoardTab projectId={projectId} canEdit={canManageWorkflow} />
          )}
        </div>
      </div>
    </div>
  )
}
