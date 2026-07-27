import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { PresenceStatus } from "@/features/workspace/workspace.types"

import * as officeApi from "./office.api"
import type { HeartbeatInput } from "./office.types"

// Sala em tempo (quase) real: poll a cada 1s. A suavização do movimento é
// feita no cliente (transição CSS entre amostras).
export function useRoom(workspaceId: string | null, floor: number) {
  return useQuery({
    // O andar entra na queryKey: sem isso, ao trocar de andar aparece por um
    // instante o cache da sala do andar anterior.
    queryKey: ["office-room", workspaceId, floor],
    queryFn: () => officeApi.getRoom(workspaceId!, floor),
    enabled: !!workspaceId,
    refetchInterval: 1000,
    refetchIntervalInBackground: false,
  })
}

export function useHeartbeat() {
  // Best-effort: falhas de heartbeat não devem virar toast/erro.
  return useMutation({
    mutationFn: (input: HeartbeatInput) => officeApi.heartbeat(input),
  })
}

export function useSetStatus(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: PresenceStatus | null) =>
      officeApi.setStatus(workspaceId!, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["office-room", workspaceId] }),
  })
}

export function useMyAvatar() {
  return useQuery({
    queryKey: ["office-my-avatar"],
    queryFn: officeApi.getMyAvatar,
  })
}
