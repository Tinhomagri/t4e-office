// "Espalhar em canais": pega uma peça aprovada e a IA adapta a mesma mensagem
// para outros canais, criando um card por canal vinculado (relates) à origem.
import { Share2, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { repurpose, type CampaignPiece, type CopyTone } from "@/features/copilot/copilot.api"
import * as wsApi from "@/features/workspace/workspace.api"
import type { Card } from "@/features/workspace/workspace.types"
import { Button, Field, Input, Modal, Select, Textarea, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"
import { CHANNEL_LABEL } from "./views/CalendarioView"

const CHANNELS = Object.keys(CHANNEL_LABEL)

const TONES: { value: CopyTone; label: string }[] = [
  { value: "", label: "Padrão do canal" },
  { value: "institucional", label: "Institucional" },
  { value: "descontraido", label: "Descontraído" },
  { value: "urgente", label: "Urgente" },
  { value: "educativo", label: "Educativo" },
  { value: "inspirador", label: "Inspirador" },
]

type EditablePiece = CampaignPiece & { _id: number }

export function RepurposeDialog({
  open,
  onClose,
  card,
  projectId,
  workspaceId,
}: {
  open: boolean
  onClose: () => void
  card: Card
  projectId: string
  workspaceId: string
}) {
  const qc = useQueryClient()
  const sourceCopy = card.description ?? ""

  const [channels, setChannels] = useState<string[]>([])
  const [tone, setTone] = useState<CopyTone>("")
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pieces, setPieces] = useState<EditablePiece[] | null>(null)

  // Não repurpose para o mesmo canal da origem.
  const options = useMemo(() => CHANNELS.filter((c) => c !== card.channel), [card.channel])

  const toggleChannel = (ch: string) =>
    setChannels((cur) => (cur.includes(ch) ? cur.filter((c) => c !== ch) : [...cur, ch]))

  const generate = async () => {
    if (channels.length === 0 || !sourceCopy.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await repurpose(workspaceId, card.title, sourceCopy, channels, tone)
      if (res.pieces.length === 0) {
        setError("A IA não retornou adaptações. Tente de novo.")
      } else {
        setPieces(res.pieces.map((p, i) => ({ ...p, _id: i })))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao adaptar.")
    } finally {
      setLoading(false)
    }
  }

  const patch = (id: number, p: Partial<CampaignPiece>) =>
    setPieces((cur) => (cur ? cur.map((x) => (x._id === id ? { ...x, ...p } : x)) : cur))
  const remove = (id: number) =>
    setPieces((cur) => (cur ? cur.filter((x) => x._id !== id) : cur))

  const createAll = async () => {
    if (!pieces || pieces.length === 0) return
    setCreating(true)
    let ok = 0
    try {
      for (const p of pieces) {
        const created = await wsApi.createCard(projectId, {
          title: p.title,
          description: p.format_hint ? `**${p.format_hint}**\n\n${p.copy}` : p.copy,
          channel: p.channel,
          labels: card.labels ?? [],
        })
        // Vincula à peça de origem (relates).
        await wsApi.createCardLink(card.id, { target_id: created.id, link_type: "relates" })
        ok++
      }
      qc.invalidateQueries({ queryKey: ["cards", projectId] })
      qc.invalidateQueries({ queryKey: ["card-links", card.id] })
      qc.invalidateQueries({ queryKey: ["marketing-report", projectId] })
      toast.success(`${ok} peça(s) criadas e vinculadas`)
      onClose()
      setPieces(null)
      setChannels([])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar cards.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Espalhar em canais"
      description="A IA adapta esta peça para outros canais e cria cards vinculados."
      footer={
        pieces ? (
          <>
            <Button variant="ghost" onClick={() => setPieces(null)} disabled={creating}>
              Voltar
            </Button>
            <Button icon={<Share2 className="size-4" />} onClick={createAll} loading={creating}>
              Criar {pieces.length} vinculada(s)
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              icon={<Share2 className="size-4" />}
              onClick={generate}
              loading={loading}
              disabled={channels.length === 0 || !sourceCopy.trim()}
            >
              Adaptar
            </Button>
          </>
        )
      }
    >
      {!sourceCopy.trim() ? (
        <p className="text-sm text-danger">
          Esta peça não tem copy na descrição para adaptar.
        </p>
      ) : !pieces ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-950/40 p-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-paper-500">
              Origem {card.channel ? `· ${CHANNEL_LABEL[card.channel] ?? card.channel}` : ""}
            </p>
            <p className="mt-1 text-sm font-medium text-ink dark:text-paper">{card.title}</p>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-paper-500">{sourceCopy}</p>
          </div>

          <Field label="Adaptar para os canais">
            <div className="flex flex-wrap gap-2">
              {options.map((ch) => {
                const on = channels.includes(ch)
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => toggleChannel(ch)}
                    className={cx(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      on
                        ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/10"
                        : "border-paper-300 text-paper-500 hover:border-paper-400",
                    )}
                  >
                    {CHANNEL_LABEL[ch]}
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="Tom de voz">
            <Select value={tone} onChange={(e) => setTone(e.target.value as CopyTone)}>
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {pieces.map((p) => (
            <div
              key={p._id}
              className="rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-900 p-3"
            >
              <div className="mb-2 flex items-center gap-2">
                <Select
                  value={p.channel}
                  onChange={(e) => patch(p._id, { channel: e.target.value })}
                  className="w-auto"
                >
                  {CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {CHANNEL_LABEL[ch]}
                    </option>
                  ))}
                </Select>
                {p.format_hint && (
                  <span className="rounded-full bg-paper-100 dark:bg-ink-800 px-2 py-0.5 text-[11px] text-paper-500">
                    {p.format_hint}
                  </span>
                )}
                <button
                  onClick={() => remove(p._id)}
                  className="ml-auto grid size-8 place-items-center rounded-lg text-paper-400 hover:bg-danger/10 hover:text-danger"
                  aria-label="Descartar"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <Input
                value={p.title}
                onChange={(e) => patch(p._id, { title: e.target.value })}
                className="mb-2 font-medium"
              />
              <Textarea rows={3} value={p.copy} onChange={(e) => patch(p._id, { copy: e.target.value })} />
            </div>
          ))}
          {pieces.length === 0 && (
            <p className="text-sm text-paper-400">Tudo descartado. Volte para adaptar de novo.</p>
          )}
        </div>
      )}
    </Modal>
  )
}
