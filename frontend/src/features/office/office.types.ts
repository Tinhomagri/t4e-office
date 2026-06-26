// src/features/office/office.types.ts
import type { AvatarConfig } from "@/features/avatar/avatar.types"

export type Direction = "up" | "down" | "left" | "right"

export type CardStatus = "in_progress" | "reviewing" | "blocked" | "meeting" | "afk"

export interface CardData {
  title: string
  status: CardStatus
  eta: string
}

export interface UserState {
  user_id: string
  name: string
  skin: number
  cloth: number
  hair: number
  accessory: number
  x: number
  y: number
  dir: Direction
  desk_id: string | null
  card?: CardData
}

export interface DeskState {
  id: string
  label: string
  tile_x: number
  tile_y: number
  is_fixed: boolean
  owner_name: string | null
}

// Mensagens recebidas do WebSocket
export type WsMessage =
  | { type: "state_sync"; users: UserState[] }
  | { type: "user_join"; user: UserState }
  | { type: "user_leave"; user_id: string }
  | { type: "move"; user_id: string; x: number; y: number; dir: Direction }
  | { type: "sit"; user_id: string; desk_id: string }
  | { type: "stand"; user_id: string }
  | { type: "card_update"; user_id: string; desk_id: string; title: string; status: CardStatus; eta: string }

export interface OfficeStore {
  myUserId: string | null
  myAvatar: AvatarConfig | null
  users: Map<string, UserState>
  desks: Map<string, DeskState>
  seatedDeskId: string | null
  proximityDeskId: string | null   // desk cujo card está aberto por proximidade
  hoveredUserId: string | null     // usuário sob o mouse

  // actions
  setMyUser(userId: string, avatar: AvatarConfig): void
  setDesks(desks: DeskState[]): void
  applyWsMessage(msg: WsMessage): void
  setSeatedDeskId(deskId: string | null): void
  setProximityDeskId(deskId: string | null): void
  setHoveredUserId(userId: string | null): void
}
