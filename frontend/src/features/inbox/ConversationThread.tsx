// Painel central: a thread de mensagens.
//
// Fidelidade ao Chatwoot: a bolha do agente é azul MUITO claro com texto
// escuro (`cw-bubble`) — não azul saturado com texto branco. Lá o azul cheio só
// aparece em botão e badge; usá-lo na bolha muda a leitura da tela inteira.
// Contato responde em bolha branca com borda fria, nota interna em âmbar,
// evento de sistema centralizado sem bolha.
//
// Movimento: mensagem entra subindo 8px em 200ms ease-out, sai só com fade.
// Nada de bounce — a thread recebe mensagem o dia todo.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useRef } from "react"
import { Check, CheckCheck, Clock, Lock, Paperclip } from "lucide-react"

import { cx } from "@/shared/ui/primitives"

import { messageIn, respectMotion } from "./inbox.motion"
import {
  groupMessagesByDay,
  initials,
  messageTime,
  shouldGroupWithPrevious,
  sortMessages,
} from "./inbox.shared"
import type { Message } from "./inbox.types"

interface Props {
  messages: Message[]
  loading: boolean
  /** Nome de quem está digitando do outro lado, se houver. */
  typingName?: string | null
}

/** Três pontos pulsando — o indicador de digitação do Chatwoot. */
function TypingIndicator({ name }: { name: string }) {
  const reduced = useReducedMotion()
  return (
    <li className="flex items-end gap-2" aria-live="polite">
      <span className="size-7 shrink-0" aria-hidden />
      <div className="rounded-lg rounded-bl-sm border border-cw-border bg-white px-3 py-2.5 dark:border-ink-700 dark:bg-ink-800">
        <span className="sr-only">{name} está digitando</span>
        <span className="flex items-center gap-1" aria-hidden>
          {[0, 1, 2].map((dot) => (
            <motion.span
              key={dot}
              className="size-1.5 rounded-full bg-cw-muted"
              animate={reduced ? undefined : { opacity: [0.3, 1, 0.3] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                ease: "easeInOut",
                delay: dot * 0.16,
              }}
            />
          ))}
        </span>
      </div>
    </li>
  )
}

export function ConversationThread({ messages, loading, typingName }: Props) {
  const reduced = useReducedMotion()
  const bottomRef = useRef<HTMLDivElement>(null)
  const ordered = sortMessages(messages)
  const groups = groupMessagesByDay(ordered)
  // Rolar só quando a thread cresce, não a cada re-render — senão o agente não
  // consegue ler o histórico sem ser puxado de volta pro fim.
  const lastId = ordered[ordered.length - 1]?.id ?? null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      block: "end",
      behavior: reduced ? "auto" : "smooth",
    })
  }, [lastId, reduced])

  if (loading && ordered.length === 0) {
    return (
      <div className="flex-1 space-y-3 overflow-y-auto bg-cw-surface p-4 dark:bg-ink-950">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cx(
              "h-14 w-2/3 animate-pulse rounded-lg bg-white dark:bg-ink-800",
              i % 2 === 1 && "ml-auto",
            )}
          />
        ))}
      </div>
    )
  }

  if (ordered.length === 0) {
    return (
      <div className="grid flex-1 place-items-center bg-cw-surface p-8 text-center dark:bg-ink-950">
        <p className="text-[13px] text-cw-muted">
          Nenhuma mensagem ainda. Escreva a primeira abaixo.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-cw-surface px-4 py-3 dark:bg-ink-950">
      {groups.map((group) => (
        <section key={group.day} aria-label={group.label}>
          <div className="sticky top-0 z-10 flex justify-center py-2">
            <span className="rounded-full border border-cw-border bg-white/90 px-2.5 py-0.5 text-[11px] font-medium text-cw-muted backdrop-blur dark:border-ink-700 dark:bg-ink-800/90">
              {group.label}
            </span>
          </div>

          <ol>
            <AnimatePresence initial={false}>
              {group.messages.map((message, index) => {
                const previous = index > 0 ? group.messages[index - 1] : null
                const grouped = shouldGroupWithPrevious(message, previous)

                // Evento do sistema ("Conversa resolvida por Ana") — centralizado,
                // sem bolha, como no Chatwoot.
                if (message.direction === "activity") {
                  return (
                    <motion.li
                      key={message.id}
                      variants={respectMotion(messageIn, reduced)}
                      initial="hidden"
                      animate="show"
                      exit="exit"
                      className="flex justify-center py-2"
                    >
                      <span className="text-[11px] italic text-cw-muted">{message.content}</span>
                    </motion.li>
                  )
                }

                const incoming = message.direction === "incoming"
                const pending = message.id < 0 || message.status === "progress"

                return (
                  <motion.li
                    key={message.id}
                    variants={respectMotion(messageIn, reduced)}
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    className={cx(
                      "flex items-end gap-2",
                      incoming ? "justify-start" : "justify-end",
                      grouped ? "mt-0.5" : "mt-3",
                    )}
                  >
                    {incoming &&
                      (grouped ? (
                        // Espaçador: mantém o alinhamento sem repetir o avatar.
                        <span className="size-7 shrink-0" aria-hidden />
                      ) : message.sender?.avatar_url ? (
                        <img
                          src={message.sender.avatar_url}
                          alt=""
                          className="size-7 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-[10px] font-semibold text-cw-muted ring-1 ring-cw-border dark:bg-ink-700 dark:text-paper-300 dark:ring-ink-600">
                          {initials(message.sender?.name ?? "?")}
                        </span>
                      ))}

                    <div className="max-w-[min(560px,78%)]">
                      {!grouped && message.sender?.name && (
                        <p
                          className={cx(
                            "mb-0.5 text-[11px] text-cw-muted",
                            incoming ? "text-left" : "text-right",
                          )}
                        >
                          {message.sender.name}
                        </p>
                      )}

                      <div
                        className={cx(
                          "px-3 py-2 text-[13px] leading-relaxed text-cw-ink shadow-xs dark:text-paper",
                          // Cantos: o lado que "aponta" para o autor fica reto,
                          // e só na última bolha do bloco — é o detalhe que faz
                          // a thread do Chatwoot parecer conversa e não lista.
                          "rounded-lg",
                          incoming ? "rounded-bl-sm" : "rounded-br-sm",
                          message.private
                            ? "border border-cw-note-border bg-cw-note"
                            : incoming
                              ? "border border-cw-border bg-white dark:border-ink-700 dark:bg-ink-800"
                              : "bg-cw-bubble dark:bg-cw-700/40",
                          pending && "opacity-70",
                        )}
                      >
                        {message.private && (
                          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-cw-note-ink">
                            <Lock className="size-3" /> Nota interna
                          </p>
                        )}

                        {message.content && (
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        )}

                        {message.attachments.length > 0 && (
                          <ul className={cx("space-y-1", message.content && "mt-2")}>
                            {message.attachments.map((attachment) =>
                              attachment.file_type === "image" ? (
                                <li key={attachment.id}>
                                  <img
                                    src={attachment.data_url}
                                    alt="Anexo"
                                    className="max-h-64 rounded object-cover"
                                  />
                                </li>
                              ) : (
                                <li key={attachment.id}>
                                  <a
                                    href={attachment.data_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 text-[12px] text-cw-600 underline underline-offset-2 transition-opacity duration-100 hover:opacity-70"
                                  >
                                    <Paperclip className="size-3" />
                                    Abrir anexo
                                  </a>
                                </li>
                              ),
                            )}
                          </ul>
                        )}
                      </div>

                      <p
                        className={cx(
                          "mt-0.5 flex items-center gap-1 text-[10px] tabular-nums text-cw-muted",
                          incoming ? "justify-start" : "justify-end",
                        )}
                      >
                        {pending ? (
                          <>
                            <Clock className="size-2.5" />
                            Enviando…
                          </>
                        ) : (
                          <>
                            {messageTime(message.created_at)}
                            {/* Recibo só na saída — o Chatwoot marca entregue
                                e lido com um e dois tiques. */}
                            {!incoming &&
                              (message.status === "read" ? (
                                <CheckCheck className="size-3 text-cw-500" />
                              ) : message.status === "delivered" ? (
                                <CheckCheck className="size-3" />
                              ) : (
                                <Check className="size-3" />
                              ))}
                          </>
                        )}
                      </p>
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ol>
        </section>
      ))}

      <ol>
        <AnimatePresence>
          {typingName && <TypingIndicator key="typing" name={typingName} />}
        </AnimatePresence>
      </ol>

      <div ref={bottomRef} />
    </div>
  )
}
