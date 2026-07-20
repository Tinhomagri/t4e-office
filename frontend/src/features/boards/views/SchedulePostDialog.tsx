// Agendar/publicar um post em uma ou mais redes sociais conectadas.
// Fluxo: (1) escolhe as redes → (2) escreve conteúdo/mídia/menções →
// (3) confere o Preview de como fica em cada rede → (4) agenda ou publica.
// Publicação real via contexto integrations (OAuth por rede).
import { Send } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  listSocialAccounts,
  type SocialAccount,
} from "@/features/copilot/copilot.api"
import { publishPost, schedulePost } from "@/features/integrations/social.api"
import { Button, Modal, Textarea, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"
import { CHANNEL_LABEL } from "./CalendarioView"
import { CHANNEL_LIMIT, SocialPostPreview } from "./SocialPostPreview"

function localDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SchedulePostDialog({
  open,
  onClose,
  workspaceId,
  projectId,
  cardId,
  initialContent,
  initialChannel,
  onScheduled,
}: {
  open: boolean
  onClose: () => void
  workspaceId: string
  projectId?: string
  cardId?: string
  initialContent?: string
  initialChannel?: string
  onScheduled?: () => void
}) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [content, setContent] = useState("")
  const [mediaText, setMediaText] = useState("")
  const [mentionsText, setMentionsText] = useState("")
  const [when, setWhen] = useState(() => localDatetimeValue(new Date()))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setContent(initialContent ?? "")
    setMediaText("")
    setMentionsText("")
    setWhen(localDatetimeValue(new Date()))
    void listSocialAccounts(workspaceId)
      .then((r) => {
        setAccounts(r.accounts)
        const preferred =
          r.accounts.find((a) => a.channel === initialChannel) ?? r.accounts[0]
        setSelectedIds(preferred ? [preferred.id] : [])
      })
      .catch(() => toast.error("Falha ao carregar contas conectadas."))
  }, [open, workspaceId, initialContent, initialChannel])

  const mediaUrls = useMemo(
    () =>
      mediaText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    [mediaText],
  )
  const mentions = useMemo(
    () =>
      mentionsText
        .split(/[\s,]+/)
        .map((s) => s.replace(/^@/, "").trim())
        .filter(Boolean),
    [mentionsText],
  )

  const selected = useMemo(
    () => accounts.filter((a) => selectedIds.includes(a.id)),
    [accounts, selectedIds],
  )

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  const submit = async (publishNow: boolean) => {
    if (selectedIds.length === 0) {
      toast.error("Selecione ao menos uma rede.")
      return
    }
    if (!content.trim()) {
      toast.error("Escreva o conteúdo do post.")
      return
    }
    setBusy(true)
    let ok = 0
    const failures: string[] = []
    for (const account of selected) {
      try {
        const post = await schedulePost({
          workspaceId,
          accountId: account.id,
          content: content.trim(),
          scheduledAt: new Date(when).toISOString(),
          projectId: projectId ?? null,
          cardId: cardId ?? null,
          mediaUrls,
          mentions,
        })
        if (publishNow) await publishPost(post.id)
        ok += 1
      } catch (e) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        failures.push(`${CHANNEL_LABEL[account.channel] ?? account.channel}${msg ? `: ${msg}` : ""}`)
      }
    }
    setBusy(false)
    if (ok > 0) {
      toast.success(
        publishNow ? `Publicado em ${ok} rede(s).` : `Agendado em ${ok} rede(s).`,
      )
      onScheduled?.()
    }
    if (failures.length) toast.error(`Falha: ${failures.join(" · ")}`)
    if (!failures.length) onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Publicar nas redes"
      description="Escolha as redes, monte o post e confira o preview de cada uma."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="outline" loading={busy} onClick={() => submit(false)}>
            Agendar
          </Button>
          <Button icon={<Send className="size-4" />} loading={busy} onClick={() => submit(true)}>
            Publicar agora
          </Button>
        </div>
      }
    >
      {accounts.length === 0 ? (
        <p className="text-sm text-paper-500">
          Nenhuma conta conectada. Conecte redes em Marketing → Redes.
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
          {/* Coluna do formulário */}
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-paper-500">Redes do post</p>
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => {
                  const on = selectedIds.includes(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggle(a.id)}
                      className={cx(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        on
                          ? "border-brand-500 bg-brand-500/10 text-brand-600"
                          : "border-paper-200 dark:border-ink-700 text-paper-500 hover:border-brand-400",
                      )}
                    >
                      {CHANNEL_LABEL[a.channel] ?? a.channel}
                      <span className="ml-1 opacity-60">· {a.account_name}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="block text-xs font-medium text-paper-500">
              Conteúdo
              <Textarea
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Texto da publicação…"
                className="mt-1"
              />
            </label>

            {/* Avisos de limite por rede selecionada */}
            {selected.some((a) => content.length > (CHANNEL_LIMIT[a.channel] ?? 1e9)) && (
              <div className="space-y-0.5">
                {selected
                  .filter((a) => content.length > (CHANNEL_LIMIT[a.channel] ?? 1e9))
                  .map((a) => (
                    <p key={a.id} className="text-[11px] text-danger">
                      {CHANNEL_LABEL[a.channel] ?? a.channel}: texto excede{" "}
                      {CHANNEL_LIMIT[a.channel]} caracteres.
                    </p>
                  ))}
              </div>
            )}

            <label className="block text-xs font-medium text-paper-500">
              Mídia (imagens/vídeos — uma URL por linha, vira carrossel)
              <Textarea
                rows={2}
                value={mediaText}
                onChange={(e) => setMediaText(e.target.value)}
                placeholder={"https://.../foto1.jpg\nhttps://.../video.mp4"}
                className="mt-1"
              />
            </label>

            <label className="block text-xs font-medium text-paper-500">
              Marcar pessoas (@menções, separadas por espaço)
              <input
                type="text"
                value={mentionsText}
                onChange={(e) => setMentionsText(e.target.value)}
                placeholder="@joao @maria"
                className="mt-1 w-full rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-2 py-2 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
              />
            </label>

            <label className="block text-xs font-medium text-paper-500">
              Quando
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="mt-1 w-full rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-2 py-2 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
              />
            </label>
          </div>

          {/* Coluna do preview */}
          <div className="space-y-3 md:max-h-[60vh] md:overflow-y-auto md:pr-1">
            <p className="text-xs font-medium text-paper-500">
              Preview {selected.length > 0 && `(${selected.length})`}
            </p>
            {selected.length === 0 ? (
              <p className="rounded-xl border border-dashed border-paper-200 dark:border-ink-700 p-4 text-center text-xs text-paper-400">
                Selecione uma rede para ver o preview.
              </p>
            ) : (
              selected.map((a) => (
                <div key={a.id} className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-paper-400">
                    {CHANNEL_LABEL[a.channel] ?? a.channel}
                  </p>
                  <SocialPostPreview
                    data={{
                      channel: a.channel,
                      accountName: a.account_name,
                      content,
                      mediaUrls,
                      mentions,
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
