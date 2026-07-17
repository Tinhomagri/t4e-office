import { api } from "@/shared/api/client"
import type { AvatarConfig } from "@/features/avatar/avatar.types"
import type { PresenceStatus } from "@/features/workspace/workspace.types"

import type { HeartbeatInput, OfficeMember } from "./office.types"

export async function heartbeat(input: HeartbeatInput): Promise<{ status: PresenceStatus }> {
  const { data } = await api.post<{ status: PresenceStatus }>(
    "/presence/heartbeat/",
    input,
  )
  return data
}

export async function getRoom(workspaceId: string): Promise<OfficeMember[]> {
  const { data } = await api.get<OfficeMember[]>("/presence/room/", {
    params: { workspace_id: workspaceId },
  })
  return data
}

// status = null limpa o override (volta ao automático).
export async function setStatus(
  workspaceId: string,
  status: PresenceStatus | null,
): Promise<{ status: PresenceStatus }> {
  const { data } = await api.put<{ status: PresenceStatus }>("/presence/status/", {
    workspace_id: workspaceId,
    status: status ?? "auto",
  })
  return data
}

export async function getMyAvatar(): Promise<AvatarConfig | null> {
  const { data } = await api.get<{ config: AvatarConfig | null }>("/presence/avatar/")
  return data.config
}

export async function saveAvatarConfig(config: AvatarConfig): Promise<AvatarConfig> {
  const { data } = await api.put<{ config: AvatarConfig }>("/presence/avatar/", {
    config,
  })
  return data.config
}
