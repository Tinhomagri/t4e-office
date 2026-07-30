import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as desksApi from "./desks.api"

export function useDeskAssignments(workspaceId: string | null, floor: number) {
  return useQuery({
    queryKey: ["desk-assignments", workspaceId, floor],
    queryFn: () => desksApi.listDeskAssignments(workspaceId!, floor),
    enabled: !!workspaceId,
    refetchInterval: 15000,
  })
}

export function useAssignDesk(workspaceId: string | null, floor: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { seatId: string; userId: string | null }) =>
      desksApi.assignDesk({ workspaceId: workspaceId!, floor, ...input }),
    onSuccess: (data) => {
      qc.setQueryData(["desk-assignments", workspaceId, floor], data)
    },
  })
}
