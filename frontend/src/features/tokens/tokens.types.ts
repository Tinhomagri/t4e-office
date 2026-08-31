export interface PersonalToken {
  id: string
  name: string
  created_at: string
  last_used_at: string | null
}

export interface PersonalTokenCreated extends PersonalToken {
  token: string
}
