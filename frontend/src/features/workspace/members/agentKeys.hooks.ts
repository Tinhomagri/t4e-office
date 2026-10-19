import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as keysApi from "./agentKeys.api"

export function useAgentKeys(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["agent-keys", workspaceId],
    queryFn: () => keysApi.listAgentKeys(workspaceId),
    enabled,
  })
}

export function useCreateAgentKey(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (nome: string) => keysApi.createAgentKey(workspaceId, nome),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-keys", workspaceId] }),
  })
}

export function useRevokeAgentKey(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (keyId: string) => keysApi.revokeAgentKey(workspaceId, keyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-keys", workspaceId] }),
  })
}
