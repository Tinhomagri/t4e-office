import { api } from "@/shared/api/client"

import type {
  AuthUser,
  ForgotPasswordPayload,
  LoginPayload,
  MessageResponse,
  RegisterPayload,
  ResetPasswordPayload,
  TokenPair,
  VerifyEmailPayload,
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

// Confirma o email via token recebido no link (ativa a conta)
export async function verifyEmail(
  payload: VerifyEmailPayload,
): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>("/auth/verify-email/", payload)
  return data
}

// Solicita link de redefinição de senha (sempre 200 — anti-enumeração)
export async function forgotPassword(
  payload: ForgotPasswordPayload,
): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>(
    "/auth/forgot-password/",
    payload,
  )
  return data
}

// Redefine a senha via token recebido por email
export async function resetPassword(
  payload: ResetPasswordPayload,
): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>("/auth/reset-password/", payload)
  return data
}
