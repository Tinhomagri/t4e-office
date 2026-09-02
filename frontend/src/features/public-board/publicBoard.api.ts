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

export interface PublicAttachment {
  id: string
  filename: string
  url: string | null
  mime_type: string
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
  attachments: PublicAttachment[]
  flagged: boolean
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

export interface PublicMessageReplyTo {
  id: string
  author_name: string
  body: string
}

export interface PublicBoardMessage {
  id: string
  author_name: string
  body: string
  from_team: boolean
  created_at: string
  reply_to: PublicMessageReplyTo | null
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

// `image` faz o POST virar multipart — sem imagem continua JSON puro
// (mais leve, é o caso comum). O backend aceita os dois no mesmo endpoint.
export async function createPublicCard(
  token: string,
  input: {
    title: string
    description?: string
    status?: string
    code?: string
    image?: File
    flagged?: boolean
  },
): Promise<PublicCard> {
  if (input.image) {
    const form = new FormData()
    form.append("title", input.title)
    if (input.description) form.append("description", input.description)
    if (input.status) form.append("status", input.status)
    if (input.code) form.append("code", input.code)
    if (input.flagged) form.append("flagged", "true")
    form.append("image", input.image)
    const { data } = await publicApi.post<PublicCard>(`/public/boards/${token}/cards/`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    return data
  }
  const { data } = await publicApi.post<PublicCard>(`/public/boards/${token}/cards/`, input)
  return data
}

export async function createPublicComment(
  token: string,
  cardId: string,
  input: { author_name: string; body: string; code?: string },
): Promise<PublicComment> {
  const { data } = await publicApi.post<PublicComment>(
    `/public/boards/${token}/cards/${cardId}/comments/`,
    input,
  )
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
  input: { author_name: string; body: string; code?: string; reply_to_id?: string },
): Promise<PublicBoardMessage> {
  const { data } = await publicApi.post<PublicBoardMessage>(
    `/public/boards/${token}/messages/`,
    input,
  )
  return data
}
