import { create } from "zustand"
import { persist } from "zustand/middleware"

import { DEFAULT_SPACE, type SpaceId } from "./spaces"

// Space ativo da sidebar. Persistido: o comercial reabre o app no CRM, não no
// board de software. A rota ainda tem precedência quando ela pertence a um
// space específico (ver spaceFromPath) — isto aqui decide as rotas neutras.
interface SpaceState {
  activeSpace: SpaceId
  setActiveSpace: (id: SpaceId) => void
}

export const useSpaceStore = create<SpaceState>()(
  persist(
    (set) => ({
      activeSpace: DEFAULT_SPACE,
      setActiveSpace: (id) => set({ activeSpace: id }),
    }),
    { name: "t4e-office-space" },
  ),
)
