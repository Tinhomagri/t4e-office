import { api } from "@/shared/api/client"

import type {
  CalendarEvent,
  CreateMeetingInput,
  GoogleStatus,
  MeetingParticipationReport,
  MeetingResult,
  TimeSlot,
  UpdateMeetingInput,
} from "./integrations.types"

// ---- Conexão Google (OAuth) ----

export async function getGoogleStatus(): Promise<GoogleStatus> {
  const { data } = await api.get<GoogleStatus>("/google/status/")
  return data
}

export async function getGoogleAuthUrl(): Promise<string> {
  const { data } = await api.get<{ authorization_url: string }>("/google/auth-url/")
  return data.authorization_url
}

export async function disconnectGoogle(): Promise<void> {
  await api.post("/google/disconnect/")
}

// ---- Agenda / reuniões ----

export async function listUpcomingEvents(range?: {
  timeMin: string
  timeMax: string
}): Promise<CalendarEvent[]> {
  const { data } = await api.get<CalendarEvent[]>("/google/events/upcoming/", {
    params: range ? { time_min: range.timeMin, time_max: range.timeMax } : undefined,
  })
  return data
}

export async function suggestTimes(params: {
  days?: number
  durationMin?: number
  attendees?: string[]
}): Promise<TimeSlot[]> {
  const { data } = await api.get<TimeSlot[]>("/google/availability/", {
    params: {
      days: params.days ?? 7,
      duration_min: params.durationMin ?? 30,
      attendees: (params.attendees ?? []).join(","),
    },
  })
  return data
}

export async function createMeeting(input: CreateMeetingInput): Promise<MeetingResult> {
  const { data } = await api.post<MeetingResult>("/google/meetings/", input)
  return data
}

export async function updateMeeting(
  eventId: string,
  input: UpdateMeetingInput,
): Promise<MeetingResult> {
  const { data } = await api.patch<MeetingResult>(`/google/meetings/${eventId}/`, input)
  return data
}

export async function cancelMeeting(eventId: string): Promise<void> {
  await api.delete(`/google/meetings/${eventId}/`)
}

export async function getMeetingReport(days = 30): Promise<MeetingParticipationReport> {
  const { data } = await api.get<MeetingParticipationReport>("/google/meetings/report/", {
    params: { days },
  })
  return data
}
