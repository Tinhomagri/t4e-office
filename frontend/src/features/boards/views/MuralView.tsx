// Mural do board: mesma mensagem que aparece no link público (sem login) —
// o time lê e responde daqui. Mensagem "de fora" e "do time" ficam em lados
// opostos, igual chat. A configuração do link/código do cliente mora bem
// aqui em cima — é o lugar natural pra achar, não escondido na aba Geral.
import { useEffect, useRef, useState } from "react"
import { Copy, CornerUpLeft, Globe2, Link2, Lock, MessageSquare, Send, X } from "lucide-react"

import {
  useBoardMessages,
  useCreateBoardMessage,
  useProject,
  useProjectPermissions,
  useUpdateProject,
} from "@/features/workspace/workspace.hooks"
import type { BoardMessage } from "@/features/workspace/workspace.types"
import { Button, Spinner, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

function fmt(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

export function MuralView({ projectId }: { projectId: string }) {
  // Bipe de mensagem nova mora no sino (NotificationBell), global — inclusive
  // com o app aberto fora desta aba. Aqui dentro seria bipe duplicado.
  const { data: messages, isLoading } = useBoardMessages(projectId)
  const create = useCreateBoardMessage(projectId)
  const [body, setBody] = useState("")
  // Mais de uma pessoa fala no mesmo mural (vários clientes + time) — sem
  // citação não dava pra saber a quem uma mensagem respondia.
  const [replyingTo, setReplyingTo] = useState<BoardMessage | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages?.length])

  const submit = () => {
    const t = body.trim()
    if (!t) return
    create.mutate(
      { body: t, replyToId: replyingTo?.id },
      { onSuccess: () => { setBody(""); setReplyingTo(null) } },
    )
  }

  const lista = messages ?? []

  return (
    <div className="space-y-4">
      <ClientConfigCard projectId={projectId} />

      <div className="flex h-[calc(100vh-30rem)] min-h-[360px] flex-col rounded-2xl border border-paper-200 bg-paper dark:border-ink-700 dark:bg-ink-900">
        <div className="border-b border-paper-200 px-4 py-3 dark:border-ink-700">
          <p className="flex items-center gap-2 text-sm font-medium text-ink dark:text-paper">
            <MessageSquare className="size-4 text-paper-400" />
            Conversa
          </p>
          <p className="mt-0.5 text-xs text-paper-500">
            Lembrete e recado trocado com quem acompanha pelo link público.
          </p>
        </div>

        {isLoading ? (
          <div className="grid flex-1 place-items-center">
            <Spinner />
          </div>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {lista.length === 0 ? (
              <p className="py-10 text-center text-sm text-paper-400">Nenhuma mensagem ainda.</p>
            ) : (
              lista.map((m) => (
                <div
                  key={m.id}
                  className={cx("group flex items-end gap-1.5", m.from_team ? "justify-end" : "justify-start")}
                >
                  {/* Botão só no hover — mural lotado de "Responder" o tempo
                      todo ficaria poluído. */}
                  {!m.from_team && (
                    <button
                      onClick={() => setReplyingTo(m)}
                      title="Responder"
                      className="mb-1 shrink-0 rounded-full p-1 text-paper-400 opacity-0 transition-opacity hover:bg-paper-100 hover:text-ink group-hover:opacity-100 dark:hover:bg-ink-800"
                    >
                      <CornerUpLeft className="size-3.5" />
                    </button>
                  )}
                  <div
                    className={cx(
                      "max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm",
                      m.from_team
                        ? "bg-brand-600 text-white"
                        : "bg-paper-100 text-ink dark:bg-ink-800 dark:text-paper",
                    )}
                  >
                    <p className="mb-0.5 text-[11px] font-medium opacity-70">
                      {m.from_team ? m.author_name || "Time" : m.author_name || "Cliente"}
                    </p>
                    {m.reply_to && (
                      <div
                        className={cx(
                          "mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs opacity-80",
                          m.from_team ? "border-white/40 bg-white/10" : "border-brand-400 bg-paper-50 dark:bg-ink-900",
                        )}
                      >
                        <p className="font-medium">{m.reply_to.author_name}</p>
                        <p className="truncate">{m.reply_to.body}</p>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                    <p className="mt-1 text-[10px] opacity-60">{fmt(m.created_at)}</p>
                  </div>
                  {m.from_team && (
                    <button
                      onClick={() => setReplyingTo(m)}
                      title="Responder"
                      className="mb-1 shrink-0 rounded-full p-1 text-paper-400 opacity-0 transition-opacity hover:bg-paper-100 hover:text-ink group-hover:opacity-100 dark:hover:bg-ink-800"
                    >
                      <CornerUpLeft className="size-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {replyingTo && (
          <div className="flex items-center gap-2 border-t border-paper-200 bg-paper-50 px-3 py-2 dark:border-ink-700 dark:bg-ink-800">
            <CornerUpLeft className="size-3.5 shrink-0 text-paper-400" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-ink dark:text-paper">
                {replyingTo.from_team ? replyingTo.author_name || "Time" : replyingTo.author_name || "Cliente"}
              </p>
              <p className="truncate text-xs text-paper-500">{replyingTo.body}</p>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="shrink-0 rounded-full p-1 text-paper-400 hover:bg-paper-100 hover:text-ink dark:hover:bg-ink-700"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 border-t border-paper-200 p-3 dark:border-ink-700">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Responder no mural…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink outline-none focus:border-brand-400 dark:border-ink-700 dark:bg-ink-800 dark:text-paper"
          />
          <button
            onClick={submit}
            disabled={!body.trim() || create.isPending}
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white transition-colors hover:bg-brand-500 disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Link público de acompanhamento (sem login) + código pra postar no mural —
// as duas coisas que decidem quem enxerga e quem escreve por fora do time.
function ClientConfigCard({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId)
  const update = useUpdateProject(projectId)
  const { can } = useProjectPermissions(projectId)
  const canEdit = can("administer_project")
  const [copiado, setCopiado] = useState(false)

  if (!project) return null

  const url = project.public_token
    ? `${window.location.origin}/public/board/${project.public_token}`
    : ""

  const copiar = async () => {
    await navigator.clipboard.writeText(url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="rounded-2xl border border-paper-200 bg-paper p-4 dark:border-ink-700 dark:bg-ink-900">
      <p className="flex items-center gap-2 text-sm font-medium text-ink dark:text-paper">
        <Globe2 className="size-4 text-paper-400" />
        Configuração do cliente
      </p>
      <p className="mt-0.5 text-xs text-paper-500">
        Link sem login pra acompanhar o board. Com código, só libera na primeira
        visita — depois o navegador do cliente lembra.
      </p>

      <div className="mt-3 space-y-3">
        {project.public_token ? (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              onClick={(e) => e.currentTarget.select()}
              className="flex-1 truncate rounded-lg border border-paper-200 bg-paper-50 px-3 py-2 text-[13px] text-paper-600 dark:border-ink-700 dark:bg-ink-800 dark:text-paper-300"
            />
            <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={copiar}>
              {copiado ? "Copiado!" : "Copiar"}
            </Button>
          </div>
        ) : (
          canEdit && (
            <Button
              size="sm"
              icon={<Link2 className="size-3.5" />}
              loading={update.isPending}
              onClick={() =>
                update.mutate(
                  { public_token_action: "generate" },
                  { onError: () => toast.error("Não foi possível gerar o link.") },
                )
              }
            >
              Gerar link público
            </Button>
          )
        )}

        {canEdit && project.public_token && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-paper-200 pt-3 dark:border-ink-800">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink dark:text-paper">
              <input
                type="checkbox"
                checked={project.public_allow_create}
                onChange={(e) => update.mutate({ public_allow_create: e.target.checked })}
                className="size-3.5 accent-brand-500"
              />
              Permitir criar cards pelo link
            </label>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!window.confirm("Revogar o link? Quem já tem o endereço deixa de conseguir acessar.")) return
                update.mutate(
                  { public_token_action: "revoke" },
                  { onError: () => toast.error("Não foi possível revogar o link.") },
                )
              }}
            >
              Revogar link
            </Button>
          </div>
        )}

        {canEdit && project.public_token && (
          <div className="flex flex-wrap items-center gap-2 border-t border-paper-200 pt-3 dark:border-ink-800">
            <p className="flex items-center gap-1.5 text-[13px] text-ink dark:text-paper">
              <Lock className="size-3.5 text-paper-400" />
              Código de acesso ao board
            </p>
            {project.public_access_code ? (
              <>
                <span className="rounded-lg border border-paper-200 bg-paper-50 px-3 py-1 font-mono text-sm tracking-widest text-ink dark:border-ink-700 dark:bg-ink-800 dark:text-paper">
                  {project.public_access_code}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    update.mutate(
                      { public_access_code_action: "revoke" },
                      { onError: () => toast.error("Não foi possível remover o código.") },
                    )
                  }
                >
                  Remover código
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                loading={update.isPending}
                onClick={() =>
                  update.mutate(
                    { public_access_code_action: "generate" },
                    { onError: () => toast.error("Não foi possível gerar o código.") },
                  )
                }
              >
                Exigir código na primeira visita
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
