// Tipos do contexto de autenticação.
// TODO: substituir por tipos gerados do schema OpenAPI do DRF (/api/schema/).

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  full_name: string
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
}
