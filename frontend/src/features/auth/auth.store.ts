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
      setUser: (user) => {
        set({ user })
        // A marca mora no perfil para acompanhar a pessoa em outro
        // computador; o store do whitelabel é só o cache que o app lê antes
        // do primeiro render. Import dinâmico para não criar ciclo.
        void import("@/shared/whitelabel").then((m) =>
          m.useWhitelabelStore.getState().setWhitelabel(
            m.sanitizeWhitelabel(user.whitelabel),
          ),
        )
      },
      clear: () => {
        set({ accessToken: null, refreshToken: null, user: null })
        // A marca é de quem estava logado: deixá-la de pé entregaria a
        // identidade visual da pessoa anterior para quem entrar depois.
        void import("@/shared/whitelabel").then((m) =>
          m.useWhitelabelStore.getState().setWhitelabel(m.EMPTY_WHITELABEL),
        )
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
