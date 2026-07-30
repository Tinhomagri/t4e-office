import { create } from "zustand"
import { persist } from "zustand/middleware"

// Preferências da sidebar, persistidas localmente. São escolhas de layout do
// usuário (o que ele fixou, o que recolheu, largura) — não têm por que ir ao
// backend nem sincronizar entre máquinas.

/** Nº máximo de itens no bloco "Recentes" — passou disso vira lista, não atalho. */
const MAX_RECENTS = 5

/** Limites do arrasto da borda: abaixo de 200px o rótulo some, acima de 400 rouba a tela. */
export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 400
/** 320px é a largura fixa da side nav do Jira — ver docs/jira-ui-spec.md. */
export const SIDEBAR_DEFAULT_WIDTH = 320

export interface RecentEntry {
  /** Rota completa, com query — é o que reabre a tela exatamente onde estava. */
  to: string
  label: string
}

interface SidebarPrefsState {
  /** Rotas fixadas pelo usuário, na ordem em que ele fixou. */
  favorites: string[]
  /** Grupos recolhidos, por heading. Ausente = expandido. */
  collapsedGroups: Record<string, boolean>
  recents: RecentEntry[]
  width: number
  toggleFavorite: (to: string) => void
  toggleGroup: (heading: string) => void
  pushRecent: (entry: RecentEntry) => void
  setWidth: (width: number) => void
}

export const useSidebarPrefs = create<SidebarPrefsState>()(
  persist(
    (set) => ({
      favorites: [],
      collapsedGroups: {},
      recents: [],
      width: SIDEBAR_DEFAULT_WIDTH,
      toggleFavorite: (to) =>
        set((s) => ({
          favorites: s.favorites.includes(to)
            ? s.favorites.filter((f) => f !== to)
            : [...s.favorites, to],
        })),
      toggleGroup: (heading) =>
        set((s) => ({
          collapsedGroups: { ...s.collapsedGroups, [heading]: !s.collapsedGroups[heading] },
        })),
      pushRecent: (entry) =>
        set((s) => {
          // Revisitar uma tela a promove ao topo em vez de duplicar a entrada.
          const rest = s.recents.filter((r) => r.to !== entry.to)
          return { recents: [entry, ...rest].slice(0, MAX_RECENTS) }
        }),
      setWidth: (width) =>
        set({
          width: Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width))),
        }),
    }),
    { name: "t4e-sidebar-prefs" },
  ),
)
