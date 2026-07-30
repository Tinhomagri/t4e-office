import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as activeCardApi from "./activeCard.api"

export function useActiveCard(
  workspaceId: string | null,
  userId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["active-card", workspaceId, userId],
    queryFn: () => activeCardApi.getActiveCard(workspaceId!, userId!),
    enabled: enabled && !!workspaceId && !!userId,
  })
}

export function useSaveWorkingNote(workspaceId: string | null, userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: activeCardApi.saveWorkingNote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-card", workspaceId, userId] })
    },
  })
}
