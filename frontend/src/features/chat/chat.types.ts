// Tipos do Google Chat (espelham os serializers do backend).

export interface ChatMember {
  member_id: string
  display_name: string
  avatar_url: string
}

export interface ChatSpace {
  space_id: string
  display_name: string
  is_group: boolean
  members: ChatMember[]
  last_message_preview: string
  last_message_at: string | null
}

export interface ChatMessage {
  message_id: string
  space_id: string
  sender_id: string
  sender_name: string
  sender_avatar_url: string
  text: string
  created_at: string
  is_own: boolean
}
