// Em que andar o usuário está, e o painel do elevador.
//
// Fica fora do engine de propósito: trocar de andar é remontar o engine com
// outro mapa, e quem manda nisso é o React.
import { create } from "zustand"

import { canGoTo } from "./world/elevator"
import { FLOORS } from "./world/floors"

interface WorldStore {
  floor: number
  panelOpen: boolean

  openPanel: () => void
  closePanel: () => void
  /** `false` = transição recusada; nada muda. */
  goToFloor: (n: number) => boolean
}

export const useWorldStore = create<WorldStore>((set, get) => ({
  floor: 1,
  panelOpen: false,

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),

  goToFloor: (n) => {
    if (!canGoTo(FLOORS, get().floor, n)) return false
    set({ floor: n, panelOpen: false })
    return true
  },
}))
