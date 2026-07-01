import { create } from "zustand"
import { persist } from "zustand/middleware"

import { DEFAULT_AVATAR, type AvatarConfig } from "./avatar.types"

interface AvatarState {
  config: AvatarConfig
  created: boolean // o usuário já salvou/criou o avatar?
  set: <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => void
  save: () => void
  reset: () => void
}

// Persiste o avatar do usuário (localStorage) — vira a "identidade" no Escritório.
export const useAvatarStore = create<AvatarState>()(
  persist(
    (set) => ({
      config: { ...DEFAULT_AVATAR },
      created: false,
      set: (key, value) => set((s) => ({ config: { ...s.config, [key]: value } })),
      save: () => set({ created: true }),
      reset: () => set({ config: { ...DEFAULT_AVATAR }, created: false }),
    }),
    { name: "pulse.avatar" },
  ),
)
