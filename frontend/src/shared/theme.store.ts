import { create } from "zustand"

// Tema fixo light (Atlassian Design System). O dark mode foi removido na
// migração — o store permanece para compatibilidade de API (toggle/set são
// no-ops) e garante que a classe `dark` nunca fique no <html>.
type Theme = "light" | "dark"

interface ThemeState {
  theme: Theme
  toggle: () => void
  set: (t: Theme) => void
}

function forceLight() {
  document.documentElement.classList.remove("dark")
}

export const useThemeStore = create<ThemeState>()((set) => ({
  theme: "light",
  toggle: () => {
    forceLight()
    set({ theme: "light" })
  },
  set: () => {
    forceLight()
    set({ theme: "light" })
  },
}))

// Garante tema claro antes do primeiro render.
forceLight()
