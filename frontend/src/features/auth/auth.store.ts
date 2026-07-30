import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { AuthUser, TokenPair } from "./auth.types"

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: AuthUser | null
  setSession: (tokens: TokenPair) => void
  setUser: (user: AuthUser) => void
  clear: () => void
}

// Estado de sessão persistido em localStorage (sobrevive a refresh da página)
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (tokens) =>
        set({ accessToken: tokens.access, refreshToken: tokens.refresh }),
      setUser: (user) => set({ user }),
      clear: () => {
        set({ accessToken: null, refreshToken: null, user: null })
        // O workspace ativo é escopo de conta, não de navegador: sem limpar, a
        // próxima pessoa a entrar herda o workspace da anterior e as primeiras
        // requisições saem com um id ao qual ela não tem acesso (403).
        // Import dinâmico para não criar ciclo entre os dois stores.
        void import("@/features/workspace/workspace.store").then((m) =>
          m.useWorkspaceStore.getState().setActiveWorkspace(null),
        )
      },
    }),
    { name: "t4e-office-auth" },
  ),
)
