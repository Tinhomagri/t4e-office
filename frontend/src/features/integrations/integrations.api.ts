import { api } from "@/shared/api/client"

import type {
  CalendarEvent,
  CreateMeetingInput,
  GoogleStatus,
  MeetingResult,
  TimeSlot,
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

export async function listUpcomingEvents(): Promise<CalendarEvent[]> {
  const { data } = await api.get<CalendarEvent[]>("/google/events/upcoming/")
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
