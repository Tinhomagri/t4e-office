// Helpers puros do Atendimento — tudo que a tela precisa decidir sem rede.
// Ficam separados dos componentes porque é aqui que mora a regra visual do
// Chatwoot que a gente está replicando (agrupamento de bolhas, prévia da
// conversa, atalho de resposta pronta) e é isso que os testes travam.
import type {
  CannedResponse,
  Conversation,
  ConversationPriority,
  ConversationStatus,
  Message,
} from "./inbox.types"

// ── Rótulos ──────────────────────────────────────────────────────────────────
export const STATUS_LABELS: Record<ConversationStatus, string> = {
  open: "Aberta",
  pending: "Pendente",
  resolved: "Resolvida",
  snoozed: "Adiada",
}

/** Tom do Badge por status — mesma semântica de cor do Chatwoot. */
export const STATUS_TONE: Record<ConversationStatus, "success" | "warning" | "neutral" | "brand"> = {
  open: "success",
  pending: "warning",
  resolved: "neutral",
  snoozed: "brand",
}

export const PRIORITY_LABELS: Record<ConversationPriority, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
}

/** Ordem de severidade — usada para ordenar e para escolher a cor. */
export const PRIORITY_RANK: Record<ConversationPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
}

export function priorityLabel(priority: ConversationPriority | null): string {
  return priority ? PRIORITY_LABELS[priority] : ""
}

// ── Tempo ────────────────────────────────────────────────────────────────────
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Tempo relativo curto, como na lista do Chatwoot: "agora", "5m", "2h", "3d".
 * Acima de uma semana vira data — "há 43d" não ajuda ninguém.
 */
export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return ""
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const diff = now.getTime() - then
  if (diff < MINUTE) return "agora"
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

/** Data futura em formato curto para exibir o prazo de snooze. */
export function futureTime(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Hora no formato da bolha de mensagem (24h, sem segundos). */
export function messageTime(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

/** Rótulo do separador de dia na thread: "Hoje", "Ontem" ou a data. */
export function dayLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(date)) / DAY)
  if (diffDays === 0) return "Hoje"
  if (diffDays === 1) return "Ontem"
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
}

// ── Lista de conversas ───────────────────────────────────────────────────────
/**
 * Texto da prévia na lista. Mensagem sem conteúdo mas com anexo mostra o tipo
 * do anexo — deixar em branco faria a conversa parecer vazia.
 */
export function conversationPreview(conversation: Conversation): string {
  const message = conversation.last_message
  if (!message) return "Sem mensagens"
  const content = message.content.trim()
  if (content) return content
  if (message.attachments.length > 0) {
    const kind = message.attachments[0].file_type
    if (kind === "image") return "📷 Imagem"
    if (kind === "audio") return "🎤 Áudio"
    if (kind === "video") return "🎬 Vídeo"
    return "📎 Anexo"
  }
  return "Sem mensagens"
}

/** Nome exibido: contato com nome, senão e-mail, telefone ou "Sem nome". */
export function contactDisplayName(conversation: Conversation): string {
  const contact = conversation.contact
  if (!contact) return "Sem contato"
  return contact.name.trim() || contact.email || contact.phone_number || "Sem nome"
}

/** Iniciais para o avatar quando não há foto (uma ou duas letras). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Ordena a lista como o Chatwoot: não lidas primeiro, depois por atividade
 * mais recente. Sem isso a conversa nova some no meio da lista.
 */
export function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    const unreadDiff = (b.unread_count > 0 ? 1 : 0) - (a.unread_count > 0 ? 1 : 0)
    if (unreadDiff !== 0) return unreadDiff
    const at = new Date(a.last_activity_at ?? a.created_at ?? 0).getTime()
    const bt = new Date(b.last_activity_at ?? b.created_at ?? 0).getTime()
    return bt - at
  })
}

// ── Thread ───────────────────────────────────────────────────────────────────
/** Janela em que mensagens seguidas do mesmo autor viram um bloco só. */
const GROUP_WINDOW = 2 * MINUTE

/**
 * Agrupa como o Chatwoot: mensagens seguidas do mesmo remetente, no mesmo
 * sentido e dentro de 2 minutos formam um bloco (só a última mostra hora e
 * avatar). Nota interna nunca agrupa com mensagem pública — visualmente elas
 * são coisas diferentes e juntar confunde quem lê rápido.
 */
export function shouldGroupWithPrevious(message: Message, previous: Message | null): boolean {
  if (!previous) return false
  if (message.direction === "activity" || previous.direction === "activity") return false
  if (message.private !== previous.private) return false
  if (message.direction !== previous.direction) return false
  if ((message.sender?.id ?? null) !== (previous.sender?.id ?? null)) return false
  if (!message.created_at || !previous.created_at) return false
  const gap = new Date(message.created_at).getTime() - new Date(previous.created_at).getTime()
  return gap >= 0 && gap <= GROUP_WINDOW
}

export interface MessageGroup {
  /** Chave estável do dia, no formato AAAA-MM-DD. */
  day: string
  label: string
  messages: Message[]
}

/** Quebra a thread em blocos por dia, para os separadores "Hoje"/"Ontem". */
export function groupMessagesByDay(messages: Message[], now: Date = new Date()): MessageGroup[] {
  const groups: MessageGroup[] = []
  for (const message of messages) {
    if (!message.created_at) continue
    const date = new Date(message.created_at)
    if (Number.isNaN(date.getTime())) continue
    const day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-")
    const last = groups[groups.length - 1]
    if (last && last.day === day) {
      last.messages.push(message)
    } else {
      groups.push({ day, label: dayLabel(message.created_at, now), messages: [message] })
    }
  }
  return groups
}

/** Mensagens em ordem cronológica — a API nem sempre garante a ordem. */
export function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    const at = new Date(a.created_at ?? 0).getTime()
    const bt = new Date(b.created_at ?? 0).getTime()
    if (at !== bt) return at - bt
    return a.id - b.id
  })
}

// ── Composer ─────────────────────────────────────────────────────────────────
/**
 * Detecta o gatilho de resposta pronta: o Chatwoot abre a lista quando a
 * mensagem começa com "/" e ainda não tem espaço depois do atalho.
 * Devolve o termo buscado, ou null se não é hora de sugerir nada.
 */
export function cannedResponseQuery(text: string): string | null {
  if (!text.startsWith("/")) return null
  const term = text.slice(1)
  if (term.includes(" ") || term.includes("\n")) return null
  return term.toLowerCase()
}

/** Filtra as respostas prontas pelo atalho ou pelo conteúdo. */
export function matchCannedResponses(
  responses: CannedResponse[],
  query: string,
): CannedResponse[] {
  if (!query) return responses.slice(0, 8)
  const needle = query.toLowerCase()
  return responses
    .filter(
      (r) =>
        r.short_code.toLowerCase().includes(needle) ||
        r.content.toLowerCase().includes(needle),
    )
    .slice(0, 8)
}

/**
 * Enter envia, Shift+Enter quebra linha — comportamento do Chatwoot.
 * Isolado aqui para o teste não precisar montar o componente.
 */
export function isSendShortcut(event: {
  key: string
  shiftKey: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}): boolean {
  if (event.key !== "Enter") return false
  if (event.shiftKey) return false
  return true
}

// ── Filtros ──────────────────────────────────────────────────────────────────
/** Limpa o objeto de filtros: chave vazia vira ausência, não string vazia. */
export function cleanFilters<T extends Record<string, unknown>>(filters: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue
    if (Array.isArray(value) && value.length === 0) continue
    out[key] = value
  }
  return out as Partial<T>
}
