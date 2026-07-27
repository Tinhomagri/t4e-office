// Estado e regras do PC do escritório.
//
// Tudo que decide comportamento de janela vive aqui, sem DOM: assim as regras
// chatas (quem herda o foco ao fechar, expandida não pode ficar minimizada) são
// provadas em teste em vez de descobertas no navegador.
import { create } from "zustand"

export type PcState = "off" | "booting" | "desktop"

export interface PcWindow {
  /** Igual ao appId: uma janela por app. */
  id: string
  appId: string
  x: number
  y: number
  w: number
  h: number
  z: number
  minimized: boolean
}

/** Deslocamento entre janelas novas, para não empilharem no mesmo pixel. */
export const CASCADE_STEP = 26
/** Quantas posições a cascata usa antes de dar a volta — não sai da tela. */
export const CASCADE_SLOTS = 6
const FIRST_X = 40
const FIRST_Y = 32
const MIN_W = 320
const MIN_H = 240

interface PcStore {
  state: PcState
  seatId: string | null
  windows: PcWindow[]
  focusedId: string | null
  expandedId: string | null
  openFolderId: string | null

  boot: (seatId: string) => void
  ready: () => void
  shutdown: () => void

  openApp: (appId: string, size: { w: number; h: number }) => void
  close: (id: string) => void
  focus: (id: string) => void
  minimize: (id: string) => void
  restore: (id: string) => void
  move: (id: string, x: number, y: number) => void
  resizeWindow: (id: string, w: number, h: number) => void
  expand: (id: string) => void
  collapse: () => void
  openFolder: (id: string | null) => void
}

/** Maior z entre as janelas — o contador vive nos dados, não em variável solta. */
function topZ(windows: PcWindow[]): number {
  return windows.reduce((max, w) => Math.max(max, w.z), 0)
}

/**
 * Primeira posição de cascata livre. Contar janelas abertas não serve: fechar a
 * primeira e abrir outra devolveria a posição de uma janela ainda aberta.
 */
function cascadeSlot(windows: PcWindow[]): number {
  const ocupadas = new Set(windows.map((w) => `${w.x},${w.y}`))
  for (let i = 0; i < CASCADE_SLOTS; i++) {
    if (!ocupadas.has(`${FIRST_X + i * CASCADE_STEP},${FIRST_Y + i * CASCADE_STEP}`)) return i
  }
  return windows.length % CASCADE_SLOTS
}

/** Janela visível mais à frente: quem herda o foco. */
function topVisibleId(windows: PcWindow[], skipId?: string): string | null {
  const candidates = windows.filter((w) => !w.minimized && w.id !== skipId)
  if (candidates.length === 0) return null
  return candidates.reduce((top, w) => (w.z > top.z ? w : top)).id
}

export const usePcStore = create<PcStore>((set, get) => ({
  state: "off",
  seatId: null,
  windows: [],
  focusedId: null,
  expandedId: null,
  openFolderId: null,

  boot: (seatId) => set({ state: "booting", seatId }),

  ready: () => set((s) => (s.state === "booting" ? { state: "desktop" } : s)),

  shutdown: () =>
    set({
      state: "off",
      seatId: null,
      windows: [],
      focusedId: null,
      expandedId: null,
      openFolderId: null,
    }),

  openApp: (appId, size) => {
    const s = get()
    if (s.state !== "desktop") return
    const existing = s.windows.find((w) => w.id === appId)
    if (existing) {
      get().restore(appId)
      return
    }
    const step = cascadeSlot(s.windows) * CASCADE_STEP
    set({
      windows: [
        ...s.windows,
        {
          id: appId,
          appId,
          x: FIRST_X + step,
          y: FIRST_Y + step,
          w: Math.max(MIN_W, size.w),
          h: Math.max(MIN_H, size.h),
          z: topZ(s.windows) + 1,
          minimized: false,
        },
      ],
      focusedId: appId,
      openFolderId: null,
    })
  },

  close: (id) =>
    set((s) => {
      if (!s.windows.some((w) => w.id === id)) return s
      const windows = s.windows.filter((w) => w.id !== id)
      return {
        windows,
        focusedId: s.focusedId === id ? topVisibleId(windows) : s.focusedId,
        expandedId: s.expandedId === id ? null : s.expandedId,
      }
    }),

  focus: (id) =>
    set((s) => {
      if (!s.windows.some((w) => w.id === id)) return s
      const z = topZ(s.windows) + 1
      return {
        windows: s.windows.map((w) => (w.id === id ? { ...w, z, minimized: false } : w)),
        focusedId: id,
      }
    }),

  minimize: (id) =>
    set((s) => {
      if (!s.windows.some((w) => w.id === id)) return s
      const windows = s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w))
      return {
        windows,
        focusedId: s.focusedId === id ? topVisibleId(windows) : s.focusedId,
        expandedId: s.expandedId === id ? null : s.expandedId,
      }
    }),

  restore: (id) => get().focus(id),

  // Os guardas de id inexistente devolvem o mesmo estado de propósito: array novo
  // sem mudança de valor faria todo assinante do store re-renderizar de graça.
  move: (id, x, y) =>
    set((s) => {
      if (!s.windows.some((w) => w.id === id)) return s
      return {
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, x: Math.max(0, x), y: Math.max(0, y) } : w,
        ),
      }
    }),

  resizeWindow: (id, nextW, nextH) =>
    set((s) => {
      if (!s.windows.some((w) => w.id === id)) return s
      return {
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, w: Math.max(MIN_W, nextW), h: Math.max(MIN_H, nextH) } : w,
        ),
      }
    }),

  expand: (id) => {
    if (!get().windows.some((w) => w.id === id)) return
    get().focus(id)
    set({ expandedId: id })
  },

  collapse: () => set({ expandedId: null }),

  openFolder: (id) => set({ openFolderId: id }),
}))
