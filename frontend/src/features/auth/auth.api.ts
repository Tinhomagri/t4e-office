import { api } from "@/shared/api/client"

import type {
  AuthUser,
  LoginPayload,
  RegisterPayload,
  TokenPair,
} from "./auth.types"

// Cadastro de usuário
export async function register(payload: RegisterPayload): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>("/auth/register/", payload)
  return data
}

// Login -> par de tokens JWT
export async function login(payload: LoginPayload): Promise<TokenPair> {
  const { data } = await api.post<TokenPair>("/auth/login/", payload)
  return data
}

// Dados do usuário autenticado
export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>("/auth/me/")
  return data
}
