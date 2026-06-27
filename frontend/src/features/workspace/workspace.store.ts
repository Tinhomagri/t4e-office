import { create } from "zustand"
import { persist } from "zustand/middleware"

// Guarda qual workspace está ativo no momento (sobrevive a refresh).
interface WorkspaceState {
  activeWorkspaceId: string | null
  setActiveWorkspace: (id: string | null) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeWorkspaceId: null,
      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
    }),
    { name: "t4e-office-workspace" },
  ),
)
