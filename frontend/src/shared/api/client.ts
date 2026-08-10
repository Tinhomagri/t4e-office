import axios, { type AxiosRequestConfig } from "axios"

import { useAuthStore } from "@/features/auth/auth.store"

// Cliente HTTP único. baseURL relativa: o proxy do Vite encaminha /api -> Django.
export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
})

const GENERIC_API_ERROR = "Não foi possível concluir. Tente novamente."
const GENERIC_UNEXPECTED_ERROR = "Erro inesperado. Tente novamente."

// Anexa o access token (quando houver) a cada requisição
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ---------------------------------------------------------------------------
// Renovação automática de token (refresh) em 401.
// Quando o access expira, o backend responde 401. Trocamos pelo refresh token
// uma única vez e refazemos a requisição. Requisições concorrentes esperam o
// mesmo refresh em vez de dispararem vários. Se o refresh também falhar,
// limpamos a sessão e mandamos para o login.
// ---------------------------------------------------------------------------
let refreshing: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refresh = useAuthStore.getState().refreshToken
  if (!refresh) return null
  try {
    // Instância "crua" (sem interceptors) para evitar laço.
    const { data } = await axios.post<{ access: string }>("/api/auth/refresh/", {
      refresh,
    })
    const store = useAuthStore.getState()
    store.setSession({ access: data.access, refresh })
    return data.access
  } catch {
    return null
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean }
    const status = error.response?.status
    const isRefreshCall = original?.url?.includes("/auth/refresh/")

    // Só 401 (não autenticado) tenta refresh. 403 é falta de permissão numa
    // sessão válida — tratá-lo igual a "sessão expirada" mascarava erros reais
    // (ex.: desconectar o Chatwoot exigindo admin) como se nada tivesse acontecido.
    if (status === 401 && original && !original._retry && !isRefreshCall) {
      original._retry = true
      // Compartilha um único refresh entre requisições concorrentes.
      if (!refreshing) refreshing = refreshAccessToken().finally(() => (refreshing = null))
      const newAccess = await refreshing

      if (newAccess) {
        original.headers = original.headers ?? {}
        ;(original.headers as Record<string, string>).Authorization = `Bearer ${newAccess}`
        return api(original)
      }

      // Refresh falhou: sessão expirada de vez.
      useAuthStore.getState().clear()
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.assign("/login")
      }
    }

    return Promise.reject(error)
  },
)

// Extrai mensagem de erro padronizada da API (campo "error" ou "detail")
function toErrorMessage(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim()
    return text.length > 0 ? text : null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = toErrorMessage(item)
      if (message) return message
    }
    return null
  }

  if (!value || typeof value !== "object") return null

  const record = value as Record<string, unknown>
  const priorityKeys = ["error", "detail", "message", "non_field_errors"]
  for (const key of priorityKeys) {
    const message = toErrorMessage(record[key])
    if (message) return message
  }

  const ignoredKeys = new Set(["code", "status", "type"])
  for (const [key, nested] of Object.entries(record)) {
    if (ignoredKeys.has(key)) continue
    const message = toErrorMessage(nested)
    if (message) return message
  }

  return null
}

export function extractApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payloadMessage = toErrorMessage(error.response?.data)
    if (payloadMessage) return payloadMessage
    return error.message || GENERIC_API_ERROR
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return GENERIC_UNEXPECTED_ERROR
}
