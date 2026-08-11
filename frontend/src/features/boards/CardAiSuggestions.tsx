import { AlertTriangle, Check, Loader2, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import * as copilotApi from "@/features/copilot/copilot.api"
import type { SuggestedLink, SuggestedSubtask } from "@/features/copilot/copilot.api"
import type { Card, LinkType } from "@/features/workspace/workspace.types"
import { Button, cx } from "@/shared/ui/primitives"

// Painel de sugestões da IA no padrão do Jira: a proposta aparece *dentro* da
// seção que ela preenche (subtarefas, vínculos), com um item por linha e
// checkbox — nada é aplicado até a pessoa clicar em "Criar tudo". Feedback e o
// aviso de qualidade ficam na mesma caixa, porque é ali que a dúvida nasce.

const RELATION_LABEL: Record<LinkType, string> = {
  relates: "Relacionado",
  blocks: "Bloqueia",
  duplicates: "Duplica",
}

function Shell({
  title,
  count,
  loading,
  error,
  onApply,
  applying,
  onDismiss,
  applyLabel,
  children,
}: {
  title: string
  count: number
  loading: boolean
  error: string | null
  onApply: () => void
  applying: boolean
  onDismiss: () => void
  applyLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-brand-200 bg-brand-50/50 dark:border-brand-500/30 dark:bg-brand-500/5">
      <div className="flex items-center gap-2 border-b border-brand-200 px-3 py-2 dark:border-brand-500/30">
        <Sparkles className="size-3.5 text-brand-500" />
        <span className="text-xs font-semibold text-ink dark:text-paper">{title}</span>
        {loading && <Loader2 className="size-3 animate-spin text-brand-500" />}
        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto text-[11px] font-medium text-paper-500 transition-colors hover:text-ink dark:hover:text-paper"
        >
          Descartar
        </button>
      </div>

      {error ? (
        <p className="flex items-start gap-1.5 px-3 py-3 text-[11px] text-danger">
          <AlertTriangle className="mt-px size-3 shrink-0" />
          {error}
        </p>
      ) : loading ? (
        <p className="px-3 py-4 text-center text-[11px] text-paper-500">
          A IA está lendo o card…
        </p>
      ) : count === 0 ? (
        <p className="px-3 py-4 text-center text-[11px] text-paper-500">
          Nada a sugerir aqui — o card já parece completo.
        </p>
      ) : (
        <>
          <div className="divide-y divide-brand-200/60 dark:divide-brand-500/20">
            {children}
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-[10px] text-paper-500">
              A qualidade do conteúdo pode variar
            </span>
            <Feedback />
            <Button size="sm" className="ml-auto" onClick={onApply} loading={applying}>
              {applyLabel}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function Feedback() {
  const [vote, setVote] = useState<"up" | "down" | null>(null)
  return (
    <span className="flex items-center gap-0.5">
      {(["up", "down"] as const).map((v) => {
        const Icon = v === "up" ? ThumbsUp : ThumbsDown
        return (
          <button
            key={v}
            type="button"
            aria-label={v === "up" ? "Sugestão útil" : "Sugestão ruim"}
            onClick={() => setVote((cur) => (cur === v ? null : v))}
            className={cx(
              "rounded p-1 transition-colors",
              vote === v
                ? "text-brand-600 dark:text-brand-400"
                : "text-paper-400 hover:text-paper-600 dark:hover:text-paper-300",
            )}
          >
            <Icon className="size-3" />
          </button>
        )
      })}
    </span>
  )
}

function Row({
  checked,
  onToggle,
  children,
}: {
  checked: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-brand-100/40 dark:hover:bg-brand-500/10"
    >
      <span
        className={cx(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors",
          checked
            ? "border-brand-500 bg-brand-500 text-white"
            : "border-paper-300 dark:border-ink-600",
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  )
}

/** Subtarefas propostas pela IA, criadas em lote como filhos do card. */
export function SubtaskSuggestions({
  card,
  onCreate,
  onDismiss,
}: {
  card: Card
  onCreate: (titles: string[]) => Promise<void>
  onDismiss: () => void
}) {
  const [items, setItems] = useState<SuggestedSubtask[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  useLoad(() => copilotApi.suggestSubtasks(card.id), (rows) => {
    setItems(rows)
    // Tudo marcado por padrão: o caminho comum é aceitar a proposta inteira,
    // e desmarcar dá menos trabalho do que marcar item a item.
    setPicked(new Set(rows.map((_, i) => i)))
  }, setError)

  const chosen = (items ?? []).filter((_, i) => picked.has(i))

  const apply = async () => {
    if (!chosen.length) return
    setApplying(true)
    try {
      await onCreate(chosen.map((s) => s.title))
      onDismiss()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar as subtarefas.")
    } finally {
      setApplying(false)
    }
  }

  return (
    <Shell
      title="Subtarefas sugeridas"
      count={items?.length ?? 0}
      loading={items === null && !error}
      error={error}
      onApply={apply}
      applying={applying}
      onDismiss={onDismiss}
      applyLabel={`Criar ${chosen.length || ""}`.trim()}
    >
      {(items ?? []).map((s, i) => (
        <Row
          key={i}
          checked={picked.has(i)}
          onToggle={() =>
            setPicked((cur) => {
              const next = new Set(cur)
              next.has(i) ? next.delete(i) : next.add(i)
              return next
            })
          }
        >
          <span className="block text-xs text-ink dark:text-paper">{s.title}</span>
          {s.reason && (
            <span className="mt-0.5 block text-[10px] text-paper-500">{s.reason}</span>
          )}
        </Row>
      ))}
    </Shell>
  )
}

/** Cards do projeto que a IA julga relacionados, prontos para virar vínculo. */
export function SimilarSuggestions({
  card,
  onLink,
  onDismiss,
}: {
  card: Card
  onLink: (links: { target_id: string; link_type: LinkType }[]) => Promise<void>
  onDismiss: () => void
}) {
  const [items, setItems] = useState<SuggestedLink[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  useLoad(() => copilotApi.suggestSimilar(card.id), (rows) => {
    setItems(rows)
    setPicked(new Set(rows.map((_, i) => i)))
  }, setError)

  const chosen = (items ?? []).filter((_, i) => picked.has(i))

  const apply = async () => {
    if (!chosen.length) return
    setApplying(true)
    try {
      await onLink(
        chosen.map((s) => ({ target_id: s.card_id, link_type: s.relation })),
      )
      onDismiss()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar os vínculos.")
    } finally {
      setApplying(false)
    }
  }

  return (
    <Shell
      title="Cards relacionados"
      count={items?.length ?? 0}
      loading={items === null && !error}
      error={error}
      onApply={apply}
      applying={applying}
      onDismiss={onDismiss}
      applyLabel={`Vincular ${chosen.length || ""}`.trim()}
    >
      {(items ?? []).map((s, i) => (
        <Row
          key={s.ref}
          checked={picked.has(i)}
          onToggle={() =>
            setPicked((cur) => {
              const next = new Set(cur)
              next.has(i) ? next.delete(i) : next.add(i)
              return next
            })
          }
        >
          <span className="flex items-baseline gap-1.5">
            <span className="shrink-0 rounded bg-paper-200 px-1 py-px text-[9px] font-semibold uppercase text-paper-600 dark:bg-ink-700 dark:text-paper-400">
              {RELATION_LABEL[s.relation]}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-paper-400">{s.ref}</span>
            <span className="truncate text-xs text-ink dark:text-paper">{s.title}</span>
          </span>
          {s.reason && (
            <span className="mt-0.5 block text-[10px] text-paper-500">{s.reason}</span>
          )}
        </Row>
      ))}
    </Shell>
  )
}

/**
 * Respostas sugeridas para o último comentário. Diferente das outras, não é
 * um lote: a pessoa escolhe uma, que cai no campo de texto para editar antes
 * de enviar — responder é escrita, não aplicação em massa.
 */
export function ReplySuggestions({
  cardId,
  onPick,
}: {
  cardId: string
  onPick: (text: string) => void
}) {
  const [items, setItems] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await copilotApi.suggestReplies(cardId))
    } catch (e) {
      setError(e instanceof Error ? e.message : "A IA não conseguiu responder.")
    } finally {
      setLoading(false)
    }
  }

  if (items === null) {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
        >
          {loading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Sparkles className="size-3" />
          )}
          Sugerir resposta
        </button>
        {error && <span className="text-[11px] text-danger">{error}</span>}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <p className="mt-1.5 text-[11px] text-paper-500">
        Sem conversa suficiente para sugerir uma resposta.
      </p>
    )
  }

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {items.map((text, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(text)}
          title={text}
          className="max-w-full truncate rounded-full border border-paper-200 bg-paper px-2.5 py-1 text-[11px] text-ink transition-colors hover:border-brand-300 hover:bg-brand-50 dark:border-ink-700 dark:bg-ink-800 dark:text-paper dark:hover:bg-brand-500/10"
        >
          {text}
        </button>
      ))}
    </div>
  )
}

// Dispara a busca uma vez, no mount. Cada painel só existe enquanto está
// aberto, então montar = pedir à IA; fechar e reabrir pede de novo, que é o
// comportamento esperado de um "sugerir de novo". O guard de `cancelled` evita
// escrever estado se a pessoa fechar o painel enquanto a IA ainda pensa.
function useLoad<T>(
  fetcher: () => Promise<T>,
  onData: (data: T) => void,
  onError: (message: string) => void,
) {
  const ref = useRef({ fetcher, onData, onError })
  ref.current = { fetcher, onData, onError }

  useEffect(() => {
    let cancelled = false
    ref.current
      .fetcher()
      .then((data) => !cancelled && ref.current.onData(data))
      .catch(
        (e) =>
          !cancelled &&
          ref.current.onError(
            e instanceof Error ? e.message : "A IA não conseguiu responder.",
          ),
      )
    return () => {
      cancelled = true
    }
  }, [])
}
