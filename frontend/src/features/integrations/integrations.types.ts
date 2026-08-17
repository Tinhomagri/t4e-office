// Tipos da integração Google (espelham os serializers do backend).

export interface GoogleStatus {
  connected: boolean
  status: "active" | "revoked" | null
  google_email: string | null
}

export interface CalendarEvent {
  event_id: string
  title: string
  start: string
  end: string
  meet_link: string | null
  html_link: string
  attendees: string[]
  all_day: boolean
  description: string
  recurring_event_id: string | null
  organizer_email: string
}

export interface TimeSlot {
  start: string
  end: string
}

export type RecurrenceFreq = "none" | "daily" | "weekly" | "monthly"

export interface CreateMeetingInput {
  title: string
  start: string
  end: string
  attendees: string[]
  description?: string
  card_id?: string | null
  // Projeto dono da reunião — quando presente, a transcrição (Meet solta no
  // Drive um tempo depois de terminar) vira Documento deste projeto.
  project_id?: string | null
  recurrence?: string[] | null
}

export interface UpdateMeetingInput {
  title?: string
  start?: string
  end?: string
  attendees?: string[]
  description?: string
}

export interface MeetingResult {
  event_id: string
  meet_link: string | null
  html_link: string
}

export interface AttendeeStat {
  email: string
  meetings: number
  minutes: number
}

export interface MeetingParticipationReport {
  total_meetings: number
  total_minutes: number
  average_minutes: number
  busiest_weekday: string | null
  top_attendees: AttendeeStat[]
}
