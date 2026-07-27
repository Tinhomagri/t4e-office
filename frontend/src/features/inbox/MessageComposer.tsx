// Editor de resposta. Replica o do Chatwoot: abas Responder/Nota interna,
// Enter envia (Shift+Enter quebra linha) e "/" abre as respostas prontas.
import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Lock, MessageSquare, Send } from "lucide-react"

import { cx } from "@/shared/ui/primitives"

import {
  cannedResponseQuery,
  isSendShortcut,
  matchCannedResponses,
} from "./inbox.shared"
import type { CannedResponse } from "./inbox.types"

interface Props {
  cannedResponses: CannedResponse[]
  canReply: boolean
  sending: boolean
  onSend: (content: string, isPrivate: boolean) => Promise<void> | void
  onTyping?: (typing: boolean) => void
}

export function MessageComposer({
  cannedResponses,
  canReply,
  sending,
  onSend,
  onTyping,
}: Props) {
  const [text, setText] = useState("")
  const [isPrivate, setIsPrivate] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const query = cannedResponseQuery(text)
  const suggestions = useMemo(
    () => (query === null ? [] : matchCannedResponses(cannedResponses, query)),
    [query, cannedResponses],
  )
  const showSuggestions = suggestions.length > 0

  // Avisa "digitando…" ao cliente, com debounce — um POST por tecla derrubaria
  // a API. O `false` sai depois de 3s parado.
  useEffect(() => {
    if (!onTyping || !text) return
    onTyping(true)
    const timer = setTimeout(() => onTyping(false), 3_000)
    return () => clearTimeout(timer)
  }, [text, onTyping])

  // Textarea cresce até 6 linhas, como no Chatwoot.
  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = "auto"
    node.style.height = `${Math.min(node.scrollHeight, 144)}px`
  }, [text])

  async function submit() {
    const content = text.trim()
    if (!content || sending) return
    // Limpa otimista: a bolha já aparece na thread. Em erro, devolve o texto.
    setText("")
    try {
      await onSend(content, isPrivate)
    } catch {
      setText(content)
    }
  }

  function applySuggestion(response: CannedResponse) {
    setText(response.content)
    setHighlight(0)
    textareaRef.current?.focus()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showSuggestions) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setHighlight((h) => (h + 1) % suggestions.length)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault()
        applySuggestion(suggestions[highlight])
        return
      }
      if (event.key === "Escape") {
        setText("")
        return
      }
    }
    if (isSendShortcut(event)) {
      event.preventDefault()
      void submit()
    }
  }

  if (!canReply) {
    return (
      <div className="border-t border-paper-300 bg-paper-100 px-4 py-3 text-center text-[12px] text-paper-600 dark:border-ink-800 dark:bg-ink-800">
        Este canal não permite responder por aqui.
      </div>
    )
  }

  return (
    <div
      className={cx(
        "relative border-t bg-paper dark:bg-ink-900",
        isPrivate
          ? "border-warning/40 bg-warning/5 dark:bg-warning/5"
          : "border-paper-300 dark:border-ink-800",
      )}
    >
      {showSuggestions && (
        <ul
          role="listbox"
          aria-label="Respostas prontas"
          className="absolute bottom-full left-3 right-3 mb-2 max-h-56 overflow-y-auto rounded-xl border border-paper-300 bg-paper shadow-lg dark:border-ink-700 dark:bg-ink-800"
        >
          {suggestions.map((response, index) => (
            <li key={response.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => applySuggestion(response)}
                className={cx(
                  "w-full px-3 py-2 text-left transition-colors duration-100",
                  index === highlight
                    ? "bg-brand-500/10"
                    : "hover:bg-paper-100 dark:hover:bg-ink-700",
                )}
              >
                <span className="block text-[12px] font-semibold text-brand-600 dark:text-brand-400">
                  /{response.short_code}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-paper-600">
                  {response.content}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Abas Responder / Nota interna */}
      <div className="flex gap-1 px-3 pt-2">
        <button
          type="button"
          onClick={() => setIsPrivate(false)}
          aria-pressed={!isPrivate}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors duration-150 focus-ring",
            !isPrivate
              ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
              : "text-paper-600 hover:bg-paper-100 dark:hover:bg-ink-800",
          )}
        >
          <MessageSquare className="size-3.5" /> Responder
        </button>
        <button
          type="button"
          onClick={() => setIsPrivate(true)}
          aria-pressed={isPrivate}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors duration-150 focus-ring",
            isPrivate
              ? "bg-warning/20 text-warning"
              : "text-paper-600 hover:bg-paper-100 dark:hover:bg-ink-800",
          )}
        >
          <Lock className="size-3.5" /> Nota interna
        </button>
      </div>

      <div className="flex items-end gap-2 p-3 pt-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          aria-label={isPrivate ? "Nota interna" : "Resposta ao cliente"}
          placeholder={
            isPrivate
              ? "Nota visível só para o time…"
              : "Escreva sua resposta…  (/ para respostas prontas)"
          }
          className="max-h-36 min-h-[38px] flex-1 resize-none rounded-xl border border-paper-300 bg-paper px-3 py-2 text-[13px] leading-relaxed outline-none transition-colors focus-ring dark:border-ink-700 dark:bg-ink-800"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!text.trim() || sending}
          aria-label="Enviar mensagem"
          className={cx(
            "grid size-[38px] shrink-0 place-items-center rounded-xl transition-all duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-40 focus-ring",
            isPrivate ? "bg-warning text-white" : "bg-brand-500 text-white hover:bg-brand-600",
          )}
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </button>
      </div>
    </div>
  )
}
