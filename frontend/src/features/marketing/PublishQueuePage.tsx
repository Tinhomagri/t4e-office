// Fila de publicação: lista os posts agendados/publicados/falhos do workspace,
// com ação de publicar agora, reprocessar (falhos) e remover. O disparo
// automático no horário é feito pelo worker do backend (publish_due_posts via
// cron); aqui o time acompanha o estado e intervém quando precisa.
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Send, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { CHANNEL_LABEL } from "@/features/boards/views/CalendarioView"
import {
  deletePost,
  listPosts,
  publishPost,
  type ScheduledPost,
  updatePost,
} from "@/features/integrations/social.api"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { Button, PageHeader, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

const STATUS_META: Record<
  ScheduledPost["status"],
  { label: string; cls: string; icon: typeof Clock }
> = {
  draft: { label: "Rascunho", cls: "text-paper-400", icon: Clock },
  scheduled: { label: "Na fila", cls: "text-brand-600", icon: Clock },
  published: { label: "Publicado", cls: "text-success", icon: CheckCircle2 },
  failed: { label: "Falhou", cls: "text-danger", icon: AlertTriangle },
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function PublishQueuePage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    if (!workspaceId) return
    setLoading(true)
    listPosts(workspaceId)
      .then(setPosts)
      .catch(() => toast.error("Falha ao carregar a fila."))
      .finally(() => setLoading(false))
  }, [workspaceId])

  useEffect(() => {
    load()
  }, [load])

  const publishNow = async (p: ScheduledPost) => {
    setBusy(p.id)
    try {
      await publishPost(p.id)
      toast.success("Publicado.")
      load()
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ? `Falha: ${msg}` : "Falha ao publicar.")
      load()
    } finally {
      setBusy(null)
    }
  }

  const requeue = async (p: ScheduledPost) => {
    setBusy(p.id)
    try {
      // PATCH reabre a fila (backend zera attempts/erro quando status=failed).
      await updatePost(p.id, { scheduled_at: new Date().toISOString() })
      toast.success("Reenfileirado.")
      load()
    } catch {
      toast.error("Falha ao reenfileirar.")
    } finally {
      setBusy(null)
    }
  }

  const remove = async (p: ScheduledPost) => {
    setBusy(p.id)
    try {
      await deletePost(p.id)
      setPosts((prev) => prev.filter((x) => x.id !== p.id))
    } catch {
      toast.error("Falha ao remover.")
    } finally {
      setBusy(null)
    }
  }

  const pending = posts.filter((p) => p.status === "scheduled" || p.status === "draft")
  const failed = posts.filter((p) => p.status === "failed")
  const published = posts.filter((p) => p.status === "published")

  const row = (p: ScheduledPost) => {
    const meta = STATUS_META[p.status]
    const Icon = meta.icon
    return (
      <div
        key={p.id}
        className="flex items-start gap-3 rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-900 p-3"
      >
        <div className="flex w-28 shrink-0 flex-col gap-0.5">
          <span className="text-xs font-semibold text-ink dark:text-paper">
            {CHANNEL_LABEL[p.channel] ?? p.channel}
          </span>
          <span className={cx("inline-flex items-center gap-1 text-[11px]", meta.cls)}>
            <Icon className="size-3" />
            {meta.label}
            {p.status === "failed" && p.attempts > 0 ? ` (${p.attempts}x)` : ""}
          </span>
          <span className="text-[11px] text-paper-400">{fmt(p.scheduled_at)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink dark:text-paper">{p.content || "—"}</p>
          <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-paper-400">
            {(p.media_urls?.length || (p.media_url ? 1 : 0)) > 0 && (
              <span>📎 {p.media_urls?.length || 1} mídia(s)</span>
            )}
            {p.mentions?.length > 0 && <span>👥 {p.mentions.map((m) => `@${m}`).join(" ")}</span>}
          </div>
          {p.status === "failed" && p.error && (
            <p className="mt-1 truncate text-[11px] text-danger" title={p.error}>
              {p.error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {p.status === "failed" && (
            <Button
              size="sm"
              variant="outline"
              icon={<RefreshCw className="size-3.5" />}
              loading={busy === p.id}
              onClick={() => requeue(p)}
            >
              Reenfileirar
            </Button>
          )}
          {p.status !== "published" && (
            <Button
              size="sm"
              icon={<Send className="size-3.5" />}
              loading={busy === p.id}
              onClick={() => publishNow(p)}
            >
              Publicar agora
            </Button>
          )}
          {p.status !== "published" && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-3.5" />}
              loading={busy === p.id}
              onClick={() => remove(p)}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        eyebrow="Marketing"
        title="Fila de publicação"
        subtitle="Posts agendados disparam sozinhos no horário. Acompanhe e intervenha aqui."
      >
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw className="size-3.5" />}
          loading={loading}
          onClick={load}
        >
          Atualizar
        </Button>
      </PageHeader>

      {!workspaceId ? (
        <p className="text-sm text-paper-400">Selecione um workspace.</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-paper-400">
          Nenhum post na fila. Agende publicações pelo Calendário editorial ou por um card.
        </p>
      ) : (
        <div className="space-y-6">
          {failed.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-danger">
                Com falha ({failed.length})
              </h2>
              {failed.map(row)}
            </section>
          )}
          {pending.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-paper-500">
                Na fila ({pending.length})
              </h2>
              {pending.map(row)}
            </section>
          )}
          {published.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-paper-500">
                Publicados ({published.length})
              </h2>
              {published.map(row)}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
