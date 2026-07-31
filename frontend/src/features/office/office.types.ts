import type { AvatarConfig, Direction } from "@/features/avatar/avatar.types"
import type { PresenceStatus } from "@/features/workspace/workspace.types"

// Um participante presente na sala (retorno de /presence/room/).
export interface OfficeMember {
  user_id: string
  name: string
  x: number // 0..1
  y: number // 0..1
  facing: Direction
  status: PresenceStatus
  avatar_config: AvatarConfig | null
  /** Mesa atribuída de uma presença automática por card em andamento. */
  seat_id?: string
}

export interface HeartbeatInput {
  workspace_id: string
  x: number
  y: number
  facing: Direction
  floor: number
}

export interface DeliveryChampion {
  user_id: string
  name: string
  deliveries: number
  avatar_config: AvatarConfig | null
}
