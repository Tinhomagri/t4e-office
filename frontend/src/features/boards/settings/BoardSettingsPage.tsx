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
import { Badge, PageHeader, Spinner, cx } from "@/shared/ui/primitives"

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
    <div className="mx-auto w-full max-w-5xl space-y-6 px-1 py-2">
      <PageHeader
        title="Configurações do quadro"
        subtitle={`${project.key} · ${project.name}`}
        eyebrow={
          <Link
            to="/app/boards"
            className="inline-flex items-center gap-1 hover:text-ink dark:hover:text-paper"
          >
            <ArrowLeft className="size-3.5" />
            Quadros
          </Link>
        }
      >
        {!canAdminister && <Badge tone="outline">Somente leitura</Badge>}
      </PageHeader>

      <div className="flex flex-col gap-6 md:flex-row">
        <nav aria-label="Seções da configuração" className="md:w-52 md:shrink-0">
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {TABS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  aria-current={active === id ? "page" : undefined}
                  onClick={() => setParams({ tab: id }, { replace: true })}
                  className={cx(
                    "flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm transition-colors focus-ring",
                    active === id
                      ? "bg-brand-50 font-medium text-brand-700"
                      : "text-paper-600 hover:bg-paper-100 dark:hover:bg-ink-800",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
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
            <BoardTab projectId={projectId} canEdit={canAdminister} />
          )}
        </div>
      </div>
    </div>
  )
}
