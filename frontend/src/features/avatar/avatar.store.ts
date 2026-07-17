import { create } from "zustand"
import { persist } from "zustand/middleware"

import { randomAvatar } from "./avatar.random"
import { DEFAULT_AVATAR, type AvatarConfig } from "./avatar.types"

const HISTORY_LIMIT = 30

interface AvatarState {
  config: AvatarConfig
  created: boolean // o usuário já salvou/criou o avatar?

  // Histórico para undo/redo (limitado a HISTORY_LIMIT; mutação trunca redo).
  history: AvatarConfig[]
  hIndex: number

  set: <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => void
  // Mutação sem histórico — usada no efeito cascata da randomização.
  setTransient: <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => void
  commit: () => void // registra o config atual como um passo do histórico
  loadConfig: (config: AvatarConfig) => void
  randomize: (seed?: number) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  save: () => void
  reset: () => void
}

// Empurra `next` no histórico truncando qualquer redo pendente.
function pushHistory(history: AvatarConfig[], hIndex: number, next: AvatarConfig) {
  const upToNow = history.slice(0, hIndex + 1)
  const appended = [...upToNow, next].slice(-HISTORY_LIMIT)
  return { history: appended, hIndex: appended.length - 1 }
}

// Persiste o avatar do usuário (localStorage) — vira a "identidade" no Escritório.
export const useAvatarStore = create<AvatarState>()(
  persist(
    (set, get) => ({
      config: { ...DEFAULT_AVATAR },
      created: false,
      history: [{ ...DEFAULT_AVATAR }],
      hIndex: 0,

      set: (key, value) =>
        set((s) => {
          const config = { ...s.config, [key]: value }
          return { config, ...pushHistory(s.history, s.hIndex, config) }
        }),

      setTransient: (key, value) =>
        set((s) => ({ config: { ...s.config, [key]: value } })),

      commit: () =>
        set((s) => ({ ...pushHistory(s.history, s.hIndex, s.config) })),

      loadConfig: (config) =>
        set((s) => ({ config, ...pushHistory(s.history, s.hIndex, config) })),

      randomize: (seed) =>
        set((s) => {
          const config = randomAvatar(seed, s.config.name)
          return { config, ...pushHistory(s.history, s.hIndex, config) }
        }),

      undo: () =>
        set((s) => {
          if (s.hIndex <= 0) return s
          return { hIndex: s.hIndex - 1, config: s.history[s.hIndex - 1] }
        }),

      redo: () =>
        set((s) => {
          if (s.hIndex >= s.history.length - 1) return s
          return { hIndex: s.hIndex + 1, config: s.history[s.hIndex + 1] }
        }),

      canUndo: () => get().hIndex > 0,
      canRedo: () => get().hIndex < get().history.length - 1,

      save: () => set({ created: true }),
      reset: () =>
        set((s) => {
          const config = { ...DEFAULT_AVATAR }
          return { config, created: false, ...pushHistory(s.history, s.hIndex, config) }
        }),
    }),
    {
      name: "pulse.avatar",
      // Histórico é volátil por sessão — só a identidade é persistida.
      partialize: (s) => ({ config: s.config, created: s.created }),
    },
  ),
)
