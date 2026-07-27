// Editor de resposta. Replica o do Chatwoot: abas Responder/Nota interna com a
// casca inteira virando âmbar no modo nota (é o aviso de "o cliente não vê
// isto"), Enter envia, Shift+Enter quebra linha, "/" abre as respostas prontas.
//
// Movimento: pill das abas desliza com layoutId, popover de sugestões sobe 6px
// em 120ms. Nada acima disso — é a área mais usada da tela.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Lock, MessageSquare, Send } from "lucide-react"

import { cx } from "@/shared/ui/primitives"

import { popoverIn, respectMotion } from "./inbox.motion"
import { cannedResponseQuery, isSendShortcut, matchCannedResponses } from "./inbox.shared"
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
  const reduced = useReducedMotion()
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

  // Avisa "digitando…" ao cliente com debounce — um POST por tecla derrubaria a
  // API. O `false` sai depois de 3s parado.
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
      <div className="border-t border-cw-border bg-cw-surface px-4 py-3 text-center text-[12px] text-cw-muted dark:border-ink-800 dark:bg-ink-800">
        Este canal não permite responder por aqui.
      </div>
    )
  }

  return (
    <div
      className={cx(
        "relative border-t transition-colors duration-150",
        isPrivate
          ? "border-cw-note-border bg-cw-note"
          : "border-cw-border bg-white dark:border-ink-800 dark:bg-ink-900",
      )}
    >
      <AnimatePresence>
        {showSuggestions && (
          <motion.ul
            key="canned"
            role="listbox"
            aria-label="Respostas prontas"
            variants={respectMotion(popoverIn, reduced)}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute bottom-full left-3 right-3 mb-2 max-h-56 origin-bottom overflow-y-auto rounded-lg border border-cw-border bg-white shadow-pop dark:border-ink-700 dark:bg-ink-800"
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
                      ? "bg-cw-500/10"
                      : "hover:bg-cw-surface dark:hover:bg-ink-700",
                  )}
                >
                  <span className="block text-[12px] font-semibold text-cw-600 dark:text-cw-500">
                    /{response.short_code}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-cw-muted">
                    {response.content}
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Abas Responder / Nota interna */}
      <div className="flex gap-0.5 px-3 pt-2">
        {[
          { value: false, label: "Responder", icon: MessageSquare },
          { value: true, label: "Nota interna", icon: Lock },
        ].map((tab) => {
          const active = isPrivate === tab.value
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => setIsPrivate(tab.value)}
              aria-pressed={active}
              className={cx(
                "relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors duration-100 focus-ring",
                active
                  ? tab.value
                    ? "text-cw-note-ink"
                    : "text-cw-600 dark:text-cw-500"
                  : "text-cw-muted hover:bg-cw-surface dark:hover:bg-ink-800",
              )}
            >
              {active && (
                <motion.span
                  layoutId="composer-tab-pill"
                  className={cx(
                    "absolute inset-0 rounded-md",
                    tab.value ? "bg-cw-note-border/60" : "bg-cw-500/10",
                  )}
                  transition={
                    reduced ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 38 }
                  }
                />
              )}
              <tab.icon className="relative size-3.5" />
              <span className="relative">{tab.label}</span>
            </button>
          )
        })}
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
          className={cx(
            "max-h-36 min-h-[38px] flex-1 resize-none rounded-md border bg-white px-3 py-2 text-[13px] leading-relaxed text-cw-ink outline-none transition-colors duration-100 placeholder:text-cw-muted focus-ring dark:bg-ink-800 dark:text-paper",
            isPrivate
              ? "border-cw-note-border focus:border-cw-note-ink/40"
              : "border-cw-border focus:border-cw-500 dark:border-ink-700",
          )}
        />
        <motion.button
          type="button"
          onClick={() => void submit()}
          disabled={!text.trim() || sending}
          aria-label="Enviar mensagem"
          whileTap={reduced ? undefined : { scale: 0.94 }}
          transition={{ duration: 0.1 }}
          className={cx(
            "grid size-[38px] shrink-0 place-items-center rounded-md text-white transition-colors duration-100 disabled:pointer-events-none disabled:opacity-40 focus-ring",
            isPrivate ? "bg-cw-note-ink hover:brightness-110" : "bg-cw-500 hover:bg-cw-600",
          )}
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </motion.button>
      </div>
    </div>
  )
}
