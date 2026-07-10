// Helpers e rótulos compartilhados pela feature de Membros & Permissões.
import { cx } from "@/shared/ui/primitives"
import type {
  Capability,
  ProjectRoleSlug,
  Role,
} from "../workspace.types"

// Iniciais para o Avatar (mesma heurística usada no board).
export function initials(name?: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export const WORKSPACE_ROLE_LABEL: Record<Role, string> = {
  owner: "Dono",
  admin: "Administrador",
  member: "Membro",
}

export const PROJECT_ROLE_LABEL: Record<ProjectRoleSlug, string> = {
  admin: "Administrador",
  developer: "Desenvolvedor",
  viewer: "Visualizador",
}

export const PROJECT_ROLE_OPTIONS: ProjectRoleSlug[] = ["admin", "developer", "viewer"]

// Rótulos PT-BR das capacidades (o que cada papel pode fazer).
export const CAPABILITY_LABEL: Record<Capability, string> = {
  browse: "Ver projeto",
  create_issue: "Criar issue",
  edit_issue: "Editar issue",
  delete_issue: "Excluir issue",
  transition_issue: "Transicionar status",
  assign_issue: "Atribuir responsável",
  comment: "Comentar",
  manage_sprints: "Gerenciar sprints",
  manage_versions: "Gerenciar versões",
  manage_components: "Gerenciar componentes",
  manage_custom_fields: "Gerenciar campos",
  manage_workflow: "Gerenciar workflow",
  manage_automation: "Gerenciar automações",
  administer_project: "Administrar projeto",
}

// Extrai mensagem de erro dos responses do backend (mesma forma do app).
export function errMsg(e: unknown): string {
  const anyE = e as { response?: { data?: { error?: string; detail?: string } } }
  return (
    anyE?.response?.data?.error ??
    anyE?.response?.data?.detail ??
    "Não foi possível concluir a operação."
  )
}

// Barra de abas estilo Jira (sublinhado no ativo).
export interface TabDef<T extends string> {
  id: T
  label: string
  icon?: React.ReactNode
}

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef<T>[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex gap-1 border-b border-ink/10 dark:border-ink-700">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
            active === t.id
              ? "border-brand-500 text-ink dark:text-paper"
              : "border-transparent text-paper-500 hover:text-ink dark:hover:text-paper",
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}

// Painel de cartão padrão (borda + fundo) reusado nas abas.
export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-ink/10 dark:border-ink-700 bg-paper dark:bg-ink-900",
        className,
      )}
    >
      {children}
    </div>
  )
}
