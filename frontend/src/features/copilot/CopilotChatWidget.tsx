import { AnimatePresence, motion } from "framer-motion"
import {
  Bot,
  Check,
  CheckCircle2,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"

import { cx } from "@/shared/ui/primitives"
import { useWorkspaces } from "@/features/workspace/workspace.hooks"
import { Markdown } from "./Markdown"
import {
  executeAgentActions,
  getAiConfig,
  ingestFile,
  sendChat,
  sendFeedback,
  type AgentActionResult,
  type ChatMessage,
  type DocKind,
  type PendingAction,
} from "./copilot.api"

function kindFromFile(f: File): DocKind {
  const n = f.name.toLowerCase()
  if (n.endsWith(".pdf")) return "pdf"
  if (n.endsWith(".docx")) return "docx"
  if (n.startsWith("audio") || /\.(mp3|wav|m4a|ogg)$/.test(n)) return "audio"
  return "text"
}

// Item do chat: mensagem + (para respostas da IA) ações propostas e seu resultado.
type ChatItem = ChatMessage & {
  actions?: PendingAction[]
  done?: AgentActionResult[]
  running?: boolean
  attachment?: string // nome do arquivo anexado (exibição)
  rated?: "up" | "down"
}

const ACTION_LABEL: Record<PendingAction["action"], string> = {
  create_card: "Criar card",
  update_card: "Editar card",
  create_sprint: "Criar sprint",
  update_sprint: "Editar sprint",
}

function errText(e: unknown): string {
  const anyE = e as { response?: { data?: { error?: string; detail?: string } } }
  return anyE?.response?.data?.error ?? anyE?.response?.data?.detail ?? "Não foi possível responder agora."
}

const SUGGESTIONS = [
  "Leia a última transcrição e crie os cards",
  "O que devo priorizar hoje?",
  "Resuma o board e aponte riscos",
]

const chatStorageKey = (ws: string) => `copilot-chat:${ws}`

// Restaura o histórico persistido, sem os flags transitórios (running).
function loadMessages(ws: string): ChatItem[] {
  try {
    const raw = localStorage.getItem(chatStorageKey(ws))
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChatItem[]
    return parsed.map((m) => ({ ...m, running: false }))
  } catch {
    return []
  }
}

export function CopilotChatWidget() {
  const { activeWorkspaceId } = useWorkspaces()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatItem[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<File | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Workspace já hidratado do storage — impede o save de sobrescrever com [] antes do load.
  const hydratedFor = useRef<string | null>(null)

  const { data: aiConfig } = useQuery({
    queryKey: ["ai-config", activeWorkspaceId],
    queryFn: () => getAiConfig(activeWorkspaceId!),
    enabled: !!activeWorkspaceId && open,
  })
  const ready = !!aiConfig?.configured && aiConfig.is_active

  // Carrega o histórico do workspace ativo (persiste entre reloads).
  useEffect(() => {
    if (!activeWorkspaceId) return
    setMessages(loadMessages(activeWorkspaceId))
    hydratedFor.current = activeWorkspaceId
  }, [activeWorkspaceId])

  // Salva o histórico — só depois de hidratar este workspace (evita clobber com []).
  useEffect(() => {
    if (!activeWorkspaceId || hydratedFor.current !== activeWorkspaceId) return
    try {
      localStorage.setItem(chatStorageKey(activeWorkspaceId), JSON.stringify(messages))
    } catch {
      /* storage cheio/indisponível — ignora */
    }
  }, [messages, activeWorkspaceId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, busy])

  if (!activeWorkspaceId) return null

  const send = async (textArg?: string) => {
    const content = (textArg ?? input).trim()
    const hasAttachment = !!attachment
    if ((!content && !hasAttachment) || busy) return
    setError(null)
    setInput("")
    setBusy(true)

    // Conteúdo visível ao usuário e conteúdo enviado à IA (com dica do anexo).
    let displayContent = content
    let wireContent = content
    const userItem: ChatItem = { role: "user", content: content || "" }

    try {
      if (attachment) {
        const file = attachment
        setAttachment(null)
        const doc = await ingestFile(activeWorkspaceId, file.name, kindFromFile(file), file)
        userItem.attachment = file.name
        displayContent = content || `Analise o documento "${file.name}".`
        userItem.content = displayContent
        // Dica invisível para a IA localizar o documento recém-anexado.
        wireContent =
          `${content || "Leia o documento que acabei de anexar e me ajude."}` +
          `\n\n[Documento anexado agora: "${doc.title}" — use a ferramenta ` +
          `read_document com document_id="${doc.id}" para ler o conteúdo.]`
      }

      const next: ChatItem[] = [...messages, userItem]
      setMessages(next)

      const wire: ChatMessage[] = next.map((m, i) => ({
        role: m.role,
        content: i === next.length - 1 ? wireContent : m.content,
      }))
      const { reply, pending_actions } = await sendChat(activeWorkspaceId, wire)
      setMessages([
        ...next,
        { role: "assistant", content: reply, actions: pending_actions },
      ])
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const rate = async (index: number, rating: "up" | "down") => {
    const item = messages[index]
    if (!item || item.rated) return
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, rated: rating } : m)),
    )
    try {
      await sendFeedback(activeWorkspaceId, rating)
    } catch {
      /* feedback é best-effort */
    }
  }

  // Confirma e executa as ações propostas pela IA para a mensagem `index`.
  const confirmActions = async (index: number) => {
    const item = messages[index]
    if (!item?.actions?.length || item.running || item.done) return
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, running: true } : m)),
    )
    try {
      const results = await executeAgentActions(activeWorkspaceId, item.actions)
      setMessages((prev) =>
        prev.map((m, i) =>
          i === index ? { ...m, running: false, done: results } : m,
        ),
      )
      // Se algo foi gravado, atualiza board/relatório para refletir na hora.
      if (results.some((r) => r.ok)) {
        qc.invalidateQueries({ queryKey: ["cards"] })
        qc.invalidateQueries({ queryKey: ["projects"] })
        qc.invalidateQueries({ queryKey: ["sprints"] })
        qc.invalidateQueries({ queryKey: ["copilot-metrics", activeWorkspaceId] })
      }
      const failed = results.filter((r) => !r.ok)
      if (failed.length) setError(failed[0].error ?? "Algumas ações falharam.")
    } catch (e) {
      setError(errText(e))
      setMessages((prev) =>
        prev.map((m, i) => (i === index ? { ...m, running: false } : m)),
      )
    }
  }

  const dismissActions = (index: number) => {
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, actions: [], done: [] } : m)),
    )
  }

  return (
    <>
      {/* Painel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-24 right-6 z-50 flex h-[560px] max-h-[calc(100vh-8rem)] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-paper-200 bg-paper shadow-2xl dark:border-ink-700 dark:bg-ink-900"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-white/15">
                  <Sparkles className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold leading-none">Copiloto IA</p>
                  <p className="mt-0.5 text-[11px] text-white/70">
                    {ready ? `${aiConfig?.provider === "openai" ? "OpenAI" : "Claude"} · ${aiConfig?.model}` : "Assistente do Pulse"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={() => {
                      setMessages([])
                      setError(null)
                    }}
                    className="rounded-lg p-1 hover:bg-white/15"
                    title="Limpar conversa"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-white/15" title="Fechar">
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Corpo */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto scrollbar-slim p-4">
              {!ready ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <Bot className="size-8 text-paper-300" />
                  <p className="text-sm font-medium text-ink dark:text-paper">IA não configurada</p>
                  <p className="max-w-[240px] text-xs text-paper-500">
                    Um administrador precisa conectar OpenAI ou Claude para este workspace.
                  </p>
                  <Link
                    to="/app/copilot"
                    onClick={() => setOpen(false)}
                    className="mt-1 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
                  >
                    Ir para o Copiloto
                  </Link>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
                    <Sparkles className="size-6" />
                  </span>
                  <p className="text-sm text-paper-500">Como posso ajudar no seu trabalho hoje?</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-full border border-paper-200 px-2.5 py-1 text-[11px] text-paper-600 hover:border-brand-400 hover:text-brand-600 dark:border-ink-700 dark:text-paper-400"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className="space-y-2">
                    <Bubble msg={m} />
                    {m.role === "assistant" && !!m.actions?.length && (
                      <ActionPreview
                        item={m}
                        onConfirm={() => confirmActions(i)}
                        onDismiss={() => dismissActions(i)}
                      />
                    )}
                    {m.role === "assistant" && !!m.content && (
                      <div className="flex items-center gap-1 pl-1">
                        <span className="text-[10px] text-paper-400">Útil?</span>
                        <button
                          onClick={() => rate(i, "up")}
                          disabled={!!m.rated}
                          className={cx(
                            "rounded p-1 hover:bg-paper-100 disabled:hover:bg-transparent dark:hover:bg-ink-800",
                            m.rated === "up" ? "text-emerald-600" : "text-paper-400",
                          )}
                          title="Resposta útil"
                        >
                          <ThumbsUp className="size-3" />
                        </button>
                        <button
                          onClick={() => rate(i, "down")}
                          disabled={!!m.rated}
                          className={cx(
                            "rounded p-1 hover:bg-paper-100 disabled:hover:bg-transparent dark:hover:bg-ink-800",
                            m.rated === "down" ? "text-red-600" : "text-paper-400",
                          )}
                          title="Resposta ruim"
                        >
                          <ThumbsDown className="size-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}

              {busy && (
                <div className="flex items-center gap-2 text-xs text-paper-400">
                  <Loader2 className="size-3.5 animate-spin" /> Pensando…
                </div>
              )}
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            {/* Input */}
            {ready && (
              <div className="border-t border-paper-200 p-3 dark:border-ink-700">
                {attachment && (
                  <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-paper-100 px-2 py-1 text-xs dark:bg-ink-800">
                    <span className="flex min-w-0 items-center gap-1.5 text-paper-600 dark:text-paper-300">
                      <Paperclip className="size-3 shrink-0" />
                      <span className="truncate">{attachment.name}</span>
                    </span>
                    <button
                      onClick={() => setAttachment(null)}
                      className="rounded p-0.5 text-paper-400 hover:text-red-600"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.txt,audio/*"
                  onChange={(e) => {
                    setAttachment(e.target.files?.[0] ?? null)
                    e.target.value = ""
                  }}
                  className="hidden"
                />
                <div className="flex items-end gap-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="grid size-9 shrink-0 place-items-center rounded-xl border border-paper-200 text-paper-500 transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-40 dark:border-ink-700"
                    title="Anexar documento (PDF, DOCX, texto, áudio)"
                  >
                    <Paperclip className="size-4" />
                  </button>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        send()
                      }
                    }}
                    rows={1}
                    placeholder="Pergunte ao Copiloto…"
                    className="max-h-28 flex-1 resize-none rounded-xl border border-paper-200 bg-paper-50 px-3 py-2 text-sm outline-none focus:border-brand-400 dark:border-ink-700 dark:bg-ink-800"
                  />
                  <button
                    onClick={() => send()}
                    disabled={(!input.trim() && !attachment) || busy}
                    className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
                  >
                    <Send className="size-4" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Balão flutuante */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cx(
          "fixed bottom-6 right-6 z-50 grid size-14 place-items-center rounded-full text-white shadow-xl transition-colors",
          "bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500",
        )}
        title="Copiloto IA"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X className="size-6" />
            </motion.span>
          ) : (
            <motion.span key="bot" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <Sparkles className="size-6" />
            </motion.span>
          )}
        </AnimatePresence>
        {!open && <span className="absolute inset-0 animate-ping rounded-full bg-violet-500/40" style={{ animationDuration: "2.5s" }} />}
      </motion.button>
    </>
  )
}

function ActionPreview({
  item,
  onConfirm,
  onDismiss,
}: {
  item: ChatItem
  onConfirm: () => void
  onDismiss: () => void
}) {
  const actions = item.actions ?? []
  const done = item.done
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-2.5 dark:border-violet-500/30 dark:bg-violet-500/10">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
        <Sparkles className="size-3" /> {done ? "Ações executadas" : "Ações propostas"}
      </p>
      <ul className="space-y-1.5">
        {actions.map((a, i) => {
          const res = done?.[i]
          return (
            <li key={i} className="text-xs text-ink dark:text-paper">
              <div className="flex items-start gap-1.5">
                {res ? (
                  res.ok ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <X className="mt-0.5 size-3.5 shrink-0 text-red-600" />
                  )
                ) : (
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-violet-500" />
                )}
                <span>
                  <span className="font-medium">{ACTION_LABEL[a.action]}</span>
                  {a.title || a.sprint_name ? `: ${a.title ?? a.sprint_name}` : ""}
                  {res?.ref ? ` → ${res.ref}` : ""}
                  {a.reason && !res ? (
                    <span className="block text-[11px] text-paper-500">{a.reason}</span>
                  ) : null}
                  {res && !res.ok ? (
                    <span className="block text-[11px] text-red-600">{res.error}</span>
                  ) : null}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      {!done && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            onClick={onDismiss}
            disabled={item.running}
            className="rounded-lg px-2.5 py-1 text-xs text-paper-600 hover:bg-paper-100 disabled:opacity-40 dark:hover:bg-ink-800"
          >
            Descartar
          </button>
          <button
            onClick={onConfirm}
            disabled={item.running}
            className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-40"
          >
            {item.running ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
            Confirmar
          </button>
        </div>
      )}
    </div>
  )
}

function Bubble({ msg }: { msg: ChatItem }) {
  const isUser = msg.role === "user"
  return (
    <div className={cx("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "whitespace-pre-wrap rounded-br-sm bg-brand-500 text-white"
            : "rounded-bl-sm bg-paper-100 text-ink dark:bg-ink-800 dark:text-paper",
        )}
      >
        {msg.attachment && (
          <span
            className={cx(
              "mb-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]",
              isUser ? "bg-white/20" : "bg-ink/10 dark:bg-white/10",
            )}
          >
            <Paperclip className="size-3" /> {msg.attachment}
          </span>
        )}
        {isUser ? msg.content : <Markdown text={msg.content} />}
      </div>
    </div>
  )
}
