import { AnimatePresence, motion } from "framer-motion"
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"

import { cx } from "@/shared/ui/primitives"
import { useWorkspaces } from "@/features/workspace/workspace.hooks"
import { getAiConfig, sendChat, type ChatMessage } from "./copilot.api"

function errText(e: unknown): string {
  const anyE = e as { response?: { data?: { error?: string; detail?: string } } }
  return anyE?.response?.data?.error ?? anyE?.response?.data?.detail ?? "Não foi possível responder agora."
}

const SUGGESTIONS = [
  "Quebre esta ideia em tarefas",
  "O que devo priorizar hoje?",
  "Resuma os riscos do projeto",
]

export function CopilotChatWidget() {
  const { activeWorkspaceId } = useWorkspaces()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: aiConfig } = useQuery({
    queryKey: ["ai-config", activeWorkspaceId],
    queryFn: () => getAiConfig(activeWorkspaceId!),
    enabled: !!activeWorkspaceId && open,
  })
  const ready = !!aiConfig?.configured && aiConfig.is_active

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, busy])

  if (!activeWorkspaceId) return null

  const send = async (textArg?: string) => {
    const content = (textArg ?? input).trim()
    if (!content || busy) return
    setError(null)
    setInput("")
    const next: ChatMessage[] = [...messages, { role: "user", content }]
    setMessages(next)
    setBusy(true)
    try {
      const reply = await sendChat(activeWorkspaceId, next)
      setMessages([...next, { role: "assistant", content: reply }])
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
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
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-white/15" title="Fechar">
                <X className="size-4" />
              </button>
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
                messages.map((m, i) => <Bubble key={i} msg={m} />)
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
                <div className="flex items-end gap-2">
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
                    disabled={!input.trim() || busy}
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

function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user"
  return (
    <div className={cx("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-brand-500 text-white"
            : "rounded-bl-sm bg-paper-100 text-ink dark:bg-ink-800 dark:text-paper",
        )}
      >
        {msg.content}
      </div>
    </div>
  )
}
