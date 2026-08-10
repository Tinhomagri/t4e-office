import axios from "axios"

export type AnonymousReportCategory =
  | "conduct"
  | "harassment"
  | "security"
  | "fraud"
  | "other"

export interface AnonymousReportPayload {
  category: AnonymousReportCategory
  description: string
}

// Não usa o cliente global: ele anexa o JWT da pessoa caso ela já esteja logada.
// Este cliente não envia credenciais, cookies ou cabeçalhos de identificação.
const anonymousApi = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  withCredentials: false,
})

export async function submitAnonymousReport(payload: AnonymousReportPayload): Promise<void> {
  await anonymousApi.post("/anonymous-reports/", payload)
}
