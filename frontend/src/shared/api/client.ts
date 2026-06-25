import axios from "axios"

import { useAuthStore } from "@/features/auth/auth.store"

// Cliente HTTP único. baseURL relativa: o proxy do Vite encaminha /api -> Django.
export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
})

// Anexa o access token (quando houver) a cada requisição
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Extrai mensagem de erro padronizada da API (campo "error" ou "detail")
export function extractApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { error?: string; detail?: string }
      | undefined
    return (
      data?.error ?? data?.detail ?? "Não foi possível concluir. Tente novamente."
    )
  }
  return "Erro inesperado. Tente novamente."
}
