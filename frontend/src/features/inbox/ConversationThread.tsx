// Painel central: cabeçalho de ações + thread de mensagens.
//
// Replica a thread do Chatwoot: entrada à esquerda, saída à direita, nota
// interna em amarelo, eventos de sistema centralizados, separador por dia e
// agrupamento de mensagens seguidas do mesmo autor.
import { useEffect, useRef } from "react"
import { Clock, Lock, Paperclip } from "lucide-react"

import { cx } from "@/shared/ui/primitives"

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
}

export function ConversationThread({ messages, loading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const ordered = sortMessages(messages)
  const groups = groupMessagesByDay(ordered)
  // Chave da última mensagem: rolar só quando a thread realmente cresce, não a
  // cada re-render (senão o usuário não consegue ler o histórico).
  const lastId = ordered[ordered.length - 1]?.id ?? null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [lastId])

  if (loading && ordered.length === 0) {
    return (
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cx(
              "h-14 w-2/3 animate-pulse rounded-2xl bg-paper-100 dark:bg-ink-800",
              i % 2 === 1 && "ml-auto",
            )}
          />
        ))}
      </div>
    )
  }

  if (ordered.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <p className="text-[13px] text-paper-600">
          Nenhuma mensagem ainda. Escreva a primeira abaixo.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {groups.map((group) => (
        <section key={group.day} aria-label={group.label}>
          <div className="sticky top-0 z-10 flex justify-center py-2">
            <span className="rounded-full bg-paper-200/90 px-2.5 py-0.5 text-[11px] font-medium text-paper-600 backdrop-blur dark:bg-ink-700/90 dark:text-paper-300">
              {group.label}
            </span>
          </div>

          <ol className="space-y-0.5">
            {group.messages.map((message, index) => {
              const previous = index > 0 ? group.messages[index - 1] : null
              const grouped = shouldGroupWithPrevious(message, previous)

              // Evento do sistema ("Conversa resolvida por Ana") — fica no meio,
              // sem bolha, como no Chatwoot.
              if (message.direction === "activity") {
                return (
                  <li key={message.id} className="flex justify-center py-1.5">
                    <span className="text-[11px] italic text-paper-500">{message.content}</span>
                  </li>
                )
              }

              const incoming = message.direction === "incoming"
              const pending = message.id < 0 || message.status === "progress"

              return (
                <li
                  key={message.id}
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
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-paper-200 text-[10px] font-semibold text-paper-700 dark:bg-ink-700 dark:text-paper-300">
                        {initials(message.sender?.name ?? "?")}
                      </span>
                    ))}

                  <div className={cx("max-w-[min(560px,78%)]", incoming ? "" : "items-end")}>
                    {!grouped && !incoming && message.sender?.name && (
                      <p className="mb-0.5 text-right text-[11px] text-paper-500">
                        {message.sender.name}
                      </p>
                    )}
                    {!grouped && incoming && message.sender?.name && (
                      <p className="mb-0.5 text-[11px] text-paper-500">{message.sender.name}</p>
                    )}

                    <div
                      className={cx(
                        "rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                        message.private
                          ? // Nota interna: amarelo, como no Chatwoot — sinaliza
                            // "o cliente não vê isso" antes de qualquer texto.
                            "border border-warning/40 bg-warning/10 text-ink dark:text-paper"
                          : incoming
                            ? "bg-paper-100 text-ink dark:bg-ink-800 dark:text-paper"
                            : "bg-brand-500 text-white",
                        pending && "opacity-70",
                      )}
                    >
                      {message.private && (
                        <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-warning">
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
                                  className="max-h-64 rounded-lg object-cover"
                                />
                              </li>
                            ) : (
                              <li key={attachment.id}>
                                <a
                                  href={attachment.data_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 text-[12px] underline underline-offset-2"
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
                        "mt-0.5 flex items-center gap-1 text-[10px] tabular-nums text-paper-500",
                        incoming ? "justify-start" : "justify-end",
                      )}
                    >
                      {pending && <Clock className="size-2.5" />}
                      {pending ? "Enviando…" : messageTime(message.created_at)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
