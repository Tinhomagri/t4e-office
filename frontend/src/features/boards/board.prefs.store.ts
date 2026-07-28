import { create } from "zustand"
import { persist } from "zustand/middleware"

// Preferências de board puramente locais. Chave = `${projectId}:${status}`.
//
// WIP limit e swimlane saíram daqui: viraram configuração de projeto no servidor
// (WorkflowStatus.wip_limit e BoardConfig.swimlane_mode), porque são regra do
// time e precisam valer para todo mundo. O colapso de coluna fica local de
// propósito — é preferência de visualização de cada pessoa.
interface BoardPrefsState {
  collapsed: Record<string, boolean>
  toggleCollapse: (key: string) => void
}

export const useBoardPrefs = create<BoardPrefsState>()(
  persist(
    (set) => ({
      collapsed: {},
      toggleCollapse: (key) =>
        set((s) => ({ collapsed: { ...s.collapsed, [key]: !s.collapsed[key] } })),
    }),
    { name: "t4e-board-prefs" },
  ),
)

export function colKey(projectId: string, status: string): string {
  return `${projectId}:${status}`
}
