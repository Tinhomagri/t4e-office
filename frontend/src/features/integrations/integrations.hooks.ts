import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as gApi from "./integrations.api"
import type { CreateMeetingInput } from "./integrations.types"

export function useGoogleStatus() {
  return useQuery({ queryKey: ["google", "status"], queryFn: gApi.getGoogleStatus })
}

export function useUpcomingEvents(enabled: boolean) {
  return useQuery({
    queryKey: ["google", "events"],
    queryFn: () => gApi.listUpcomingEvents(),
    enabled,
  })
}

export function useDayEvents(enabled: boolean, day: Date) {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  const timeMin = dayStart.toISOString()
  const timeMax = new Date(dayStart.getTime() + 86_400_000).toISOString()
  return useQuery({
    queryKey: ["google", "events", "day", timeMin],
    queryFn: () => gApi.listUpcomingEvents({ timeMin, timeMax }),
    enabled,
  })
}

export function useWeekEvents(enabled: boolean, weekStart: Date) {
  const timeMin = weekStart.toISOString()
  const timeMax = new Date(weekStart.getTime() + 7 * 86_400_000).toISOString()
  return useQuery({
    queryKey: ["google", "events", "week", timeMin],
    queryFn: () => gApi.listUpcomingEvents({ timeMin, timeMax }),
    enabled,
  })
}

export function useConnectGoogle() {
  // Redireciona o navegador para o consent do Google.
  return useMutation({
    mutationFn: gApi.getGoogleAuthUrl,
    onSuccess: (url) => {
      window.location.assign(url)
    },
  })
}

export function useDisconnectGoogle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: gApi.disconnectGoogle,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google"] }),
  })
}

export function useCreateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMeetingInput) => gApi.createMeeting(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google", "events"] }),
  })
}
