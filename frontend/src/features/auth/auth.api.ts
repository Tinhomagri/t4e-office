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

// URL de consentimento do Google p/ login/cadastro (redireciona o navegador)
export async function getGoogleLoginUrl(): Promise<string> {
  const { data } = await api.get<{ authorization_url: string }>(
    "/auth/google/login-url/",
  )
  return data.authorization_url
}

// Dados do usuário autenticado
export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>("/auth/me/")
  return data
}

export async function updateProfile(payload: { full_name?: string; avatar_image?: string }): Promise<AuthUser> {
  const { data } = await api.patch<AuthUser>("/auth/me/", payload)
  return data
}

export async function profileImageDataUri(file: File | null): Promise<string> {
  if (!file) return ""
  const bitmap = await createImageBitmap(file)
  try {
    const size = 256
    const canvas = document.createElement("canvas")
    canvas.width = size; canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Não foi possível processar a imagem.")
    const side = Math.min(bitmap.width, bitmap.height)
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
    return canvas.toDataURL("image/webp", 0.82)
  } finally { bitmap.close() }
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
