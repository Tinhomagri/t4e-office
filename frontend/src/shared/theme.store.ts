import { create } from "zustand"
import { persist } from "zustand/middleware"

// Dark mode real — a paleta ink/paper/brand já tem os tons `dark:` mapeados
// (ink-900/950 = navy escuro), herdados de antes da migração pro Atlassian
// light. O store persiste a escolha; o script inline em index.html aplica a
// classe antes do primeiro paint pra evitar flash de tema errado.
type Theme = "light" | "dark"

const STORAGE_KEY = "t4e-office-theme"

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
}

interface ThemeState {
  theme: Theme
  toggle: () => void
  set: (t: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: systemPrefersDark() ? "dark" : "light",
      toggle: () => {
        const next = get().theme === "dark" ? "light" : "dark"
        applyTheme(next)
        set({ theme: next })
      },
      set: (t) => {
        applyTheme(t)
        set({ theme: t })
      },
    }),
    {
      name: STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      },
    },
  ),
)
