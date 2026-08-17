import axios from "axios"

// Cliente próprio, sem o `api` global: aquele anexa o JWT de quem estiver
// logado no navegador — o board público precisa funcionar (e responder
// igual) pra qualquer um, logado ou não, sem depender de sessão nenhuma.
const publicApi = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  withCredentials: false,
})

export interface PublicComment {
  id: string
  author_name: string
  body: string
  created_at: string
}

export interface PublicCard {
  id: string
  ref: string
  title: string
  description: string
  status: string
  type: string
  priority: string
  points: number | null
  assignee_name: string | null
  labels: string[]
  due_date: string | null
  comments: PublicComment[]
}

export interface PublicColumn {
  id: string
  slug: string
  name: string
  color: string
  order: number
}

export interface PublicBoard {
  project: { name: string; key: string }
  allow_create: boolean
  columns: PublicColumn[]
  cards: PublicCard[]
}

export interface PublicBoardMessage {
  id: string
  author_name: string
  body: string
  from_team: boolean
  created_at: string
}

// Código de acesso: quando o board pede, TODA rota (board, criar card,
// mural) exige o mesmo código — senão dava pra pular o popup de entrada e
// falar direto com a API. `code` vazio/undefined é ignorado pelo backend
// quando não há código configurado.
export async function getPublicBoard(token: string, code?: string): Promise<PublicBoard> {
  const { data } = await publicApi.get<PublicBoard>(`/public/boards/${token}/`, {
    params: code ? { code } : undefined,
  })
  return data
}

export async function createPublicCard(
  token: string,
  input: { title: string; description?: string; status?: string; code?: string },
): Promise<PublicCard> {
  const { data } = await publicApi.post<PublicCard>(`/public/boards/${token}/cards/`, input)
  return data
}

export async function getPublicMessages(token: string, code?: string): Promise<PublicBoardMessage[]> {
  const { data } = await publicApi.get<PublicBoardMessage[]>(`/public/boards/${token}/messages/`, {
    params: code ? { code } : undefined,
  })
  return data
}

export async function createPublicMessage(
  token: string,
  input: { author_name: string; body: string; code?: string },
): Promise<PublicBoardMessage> {
  const { data } = await publicApi.post<PublicBoardMessage>(
    `/public/boards/${token}/messages/`,
    input,
  )
  return data
}
