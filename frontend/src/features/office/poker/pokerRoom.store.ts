// Estado de UI da sala de Planning Poker do andar 2: painel do host
// (console) e o mini-seletor de carta de quem está sentado votando.
//
// Fica fora do engine de propósito, igual ao world.store do elevador: são
// dois overlays React independentes, sem estado de simulação.
import { create } from "zustand"

interface PokerRoomStore {
  consoleOpen: boolean
  voteSeatId: string | null

  openConsole: () => void
  closeConsole: () => void
  openVote: (seatId: string) => void
  closeVote: () => void
}

export const usePokerRoomStore = create<PokerRoomStore>((set) => ({
  consoleOpen: false,
  voteSeatId: null,

  openConsole: () => set({ consoleOpen: true }),
  closeConsole: () => set({ consoleOpen: false }),
  openVote: (seatId) => set({ voteSeatId: seatId }),
  closeVote: () => set({ voteSeatId: null }),
}))
