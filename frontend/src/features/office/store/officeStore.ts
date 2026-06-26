// src/features/office/store/officeStore.ts
import { create } from "zustand"
import type { AvatarConfig } from "@/features/avatar/avatar.types"
import type { CardStatus, DeskState, OfficeStore, WsMessage } from "@/features/office/office.types"

export const useOfficeStore = create<OfficeStore>()((set) => ({
  myUserId: null,
  myAvatar: null,
  users: new Map(),
  desks: new Map(),
  seatedDeskId: null,
  proximityDeskId: null,
  hoveredUserId: null,

  setMyUser(userId: string, avatar: AvatarConfig) {
    set({ myUserId: userId, myAvatar: avatar })
  },

  setDesks(desks: DeskState[]) {
    set({ desks: new Map(desks.map((d) => [d.id, d])) })
  },

  applyWsMessage(msg: WsMessage) {
    set((state) => {
      const users = new Map(state.users)
      switch (msg.type) {
        case "state_sync":
          return { users: new Map(msg.users.map((u) => [u.user_id, u])) }
        case "user_join":
          users.set(msg.user.user_id, msg.user)
          return { users }
        case "user_leave":
          users.delete(msg.user_id)
          return { users }
        case "move": {
          const u = users.get(msg.user_id)
          if (u) users.set(msg.user_id, { ...u, x: msg.x, y: msg.y, dir: msg.dir })
          return { users }
        }
        case "sit": {
          const u = users.get(msg.user_id)
          if (u) users.set(msg.user_id, { ...u, desk_id: msg.desk_id })
          const next: Partial<OfficeStore> = { users }
          if (msg.user_id === state.myUserId) next.seatedDeskId = msg.desk_id
          return next
        }
        case "stand": {
          const u = users.get(msg.user_id)
          if (u) users.set(msg.user_id, { ...u, desk_id: null })
          const next: Partial<OfficeStore> = { users }
          if (msg.user_id === state.myUserId) next.seatedDeskId = null
          return next
        }
        case "card_update": {
          const u = users.get(msg.user_id)
          if (u) users.set(msg.user_id, {
            ...u,
            card: { title: msg.title, status: msg.status as CardStatus, eta: msg.eta },
          })
          return { users }
        }
      }
      return {}
    })
  },

  setSeatedDeskId(deskId) { set({ seatedDeskId: deskId }) },
  setProximityDeskId(deskId) { set({ proximityDeskId: deskId }) },
  setHoveredUserId(userId) { set({ hoveredUserId: userId }) },
}))
