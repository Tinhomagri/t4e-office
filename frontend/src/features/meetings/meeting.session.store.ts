import { create } from "zustand"
import type { JoinResult } from "./meetings.api"

type MeetingSessionState = {
  session: JoinResult | null
  setSession: (session: JoinResult | null) => void
}

export const useMeetingSessionStore = create<MeetingSessionState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
}))
