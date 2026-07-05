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
}

export interface TimeSlot {
  start: string
  end: string
}

export interface CreateMeetingInput {
  title: string
  start: string
  end: string
  attendees: string[]
  description?: string
  card_id?: string | null
}

export interface MeetingResult {
  event_id: string
  meet_link: string | null
  html_link: string
}
