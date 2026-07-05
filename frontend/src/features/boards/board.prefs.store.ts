import { create } from "zustand"
import { persist } from "zustand/middleware"

// Preferências de board por coluna (WIP limit + colapso), persistidas localmente.
// Chave = `${projectId}:${status}`. Mantido no client para não exigir schema novo
// no backend nesta etapa (pode migrar para WorkflowStatus.wip_limit no futuro).
export type SwimlaneMode = "none" | "epic" | "assignee" | "priority"

interface BoardPrefsState {
  wipLimits: Record<string, number>
  collapsed: Record<string, boolean>
  // Modo de swimlane por projeto (estilo "Agrupar por" do Jira).
  swimlanes: Record<string, SwimlaneMode>
  setWip: (key: string, limit: number | null) => void
  toggleCollapse: (key: string) => void
  setSwimlane: (projectId: string, mode: SwimlaneMode) => void
}

export const useBoardPrefs = create<BoardPrefsState>()(
  persist(
    (set) => ({
      wipLimits: {},
      collapsed: {},
      swimlanes: {},
      setWip: (key, limit) =>
        set((s) => {
          const next = { ...s.wipLimits }
          if (limit == null || limit <= 0) delete next[key]
          else next[key] = limit
          return { wipLimits: next }
        }),
      toggleCollapse: (key) =>
        set((s) => ({ collapsed: { ...s.collapsed, [key]: !s.collapsed[key] } })),
      setSwimlane: (projectId, mode) =>
        set((s) => ({ swimlanes: { ...s.swimlanes, [projectId]: mode } })),
    }),
    { name: "t4e-board-prefs" },
  ),
)

export function colKey(projectId: string, status: string): string {
  return `${projectId}:${status}`
}
