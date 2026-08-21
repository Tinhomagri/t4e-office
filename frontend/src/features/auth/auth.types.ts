// Tipos do contexto de autenticação.
// TODO: substituir por tipos gerados do schema OpenAPI do DRF (/api/schema/).

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  full_name: string
  avatar_url?: string | null
  password: string
}

export interface TokenPair {
  access: string
  refresh: string
}

export interface AuthUser {
  id: string
  email: string
  full_name: string
  avatar_url?: string | null
  job_title?: string
  phone?: string
  bio?: string
  location?: string
  timezone?: string
  language?: "pt-BR" | "en-US" | "es"
  theme?: "system" | "light" | "dark"
  density?: "comfortable" | "compact"
  notification_preferences?: Record<string, boolean>
  availability?: "available" | "focus" | "away" | "offline"
  has_usable_password?: boolean
  date_joined?: string
}

export type ProfileUpdatePayload = Partial<Omit<AuthUser, "id" | "email" | "avatar_url" | "has_usable_password" | "date_joined">> & {
  avatar_image?: string
}

export interface ForgotPasswordPayload {
  email: string
}

export interface ResetPasswordPayload {
  token: string
  new_password: string
}

export interface VerifyEmailPayload {
  token: string
}

export interface MessageResponse {
  message: string
}
