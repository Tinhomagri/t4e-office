// Wizard "Brief → Campanha": a partir de um briefing, a IA gera um plano
// multicanal (1+ peças por canal, datas escalonadas na janela). O usuário
// edita/descarta as peças e materializa cada uma como card do board, agrupadas
// por um label de campanha (campanha:<slug>).
import { Sparkles, Trash2, Wand2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { generateCampaign, type CampaignPiece, type CopyTone } from "@/features/copilot/copilot.api"
import { useCreateCard } from "@/features/workspace/workspace.hooks"
import { Button, Field, Input, Modal, Select, Textarea, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"
import { CHANNEL_LABEL } from "./CalendarioView"

const CHANNELS = Object.keys(CHANNEL_LABEL)

const TONES: { value: CopyTone; label: string }[] = [
  { value: "", label: "Padrão do canal" },
  { value: "institucional", label: "Institucional" },
  { value: "descontraido", label: "Descontraído" },
  { value: "urgente", label: "Urgente" },
  { value: "educativo", label: "Educativo" },
  { value: "inspirador", label: "Inspirador" },
]

// slug estável para o label da campanha (ex.: "Lançamento Curso" → "lancamento-curso")
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00")
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

type EditablePiece = CampaignPiece & { _id: number }

export function CampaignWizard({
  open,
  onClose,
  projectId,
  workspaceId,
  projectKey,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  workspaceId: string
  projectKey: string
}) {
  const qc = useQueryClient()
  const createCard = useCreateCard(projectId)

  const [brief, setBrief] = useState("")
  const [campaignName, setCampaignName] = useState("")
  const [channels, setChannels] = useState<string[]>(["instagram", "email"])
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(addDaysISO(todayISO(), 6))
  const [perChannel, setPerChannel] = useState(1)
  const [tone, setTone] = useState<CopyTone>("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pieces, setPieces] = useState<EditablePiece[] | null>(null)
  const [creating, setCreating] = useState(false)

  const campaignSlug = useMemo(
    () => slugify(campaignName || brief.split("\n")[0] || "campanha"),
    [campaignName, brief],
  )

  const toggleChannel = (ch: string) =>
    setChannels((cur) => (cur.includes(ch) ? cur.filter((c) => c !== ch) : [...cur, ch]))

  const reset = () => {
    setPieces(null)
    setError(null)
  }

  const generate = async () => {
    if (!brief.trim() || channels.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await generateCampaign({
        workspaceId,
        brief: brief.trim(),
        channels,
        startDate,
        endDate,
        perChannel,
        tone,
      })
      if (res.pieces.length === 0) {
        setError("A IA não retornou peças válidas. Ajuste o briefing e tente de novo.")
        setPieces(null)
      } else {
        setPieces(res.pieces.map((p, i) => ({ ...p, _id: i })))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar campanha.")
    } finally {
      setLoading(false)
    }
  }

  const patchPiece = (id: number, patch: Partial<CampaignPiece>) =>
    setPieces((cur) => (cur ? cur.map((p) => (p._id === id ? { ...p, ...patch } : p)) : cur))

  const removePiece = (id: number) =>
    setPieces((cur) => (cur ? cur.filter((p) => p._id !== id) : cur))

  const createAll = async () => {
    if (!pieces || pieces.length === 0) return
    setCreating(true)
    const label = `campanha:${campaignSlug}`
    let ok = 0
    try {
      for (const p of pieces) {
        await createCard.mutateAsync({
          title: p.title,
          description: p.format_hint ? `**${p.format_hint}**\n\n${p.copy}` : p.copy,
          channel: p.channel,
          publish_date: p.publish_date,
          labels: [label],
        })
        ok++
      }
      qc.invalidateQueries({ queryKey: ["cards", projectId] })
      qc.invalidateQueries({ queryKey: ["marketing-report", projectId] })
      toast.success(`${ok} peça(s) criadas na campanha ${campaignSlug}`)
      onClose()
      setBrief("")
      setCampaignName("")
      reset()
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
      title="Nova campanha"
      description="Descreva o briefing e a IA monta um plano multicanal editável."
      footer={
        pieces ? (
          <>
            <Button variant="ghost" onClick={reset} disabled={creating}>
              Voltar ao briefing
            </Button>
            <Button icon={<Sparkles className="size-4" />} onClick={createAll} loading={creating}>
              Criar {pieces.length} no board
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              icon={<Wand2 className="size-4" />}
              onClick={generate}
              loading={loading}
              disabled={!brief.trim() || channels.length === 0}
            >
              Gerar campanha
            </Button>
          </>
        )
      }
    >
      {!pieces ? (
        <div className="space-y-4">
          <Field label="Briefing" hint="O quê, para quem, objetivo, tom desejado, ofertas…">
            <Textarea
              rows={4}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Ex.: Lançamento do Curso de Verão, público jovem, foco em inscrições até 27/07."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da campanha" hint={`Label: campanha:${campaignSlug}`}>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Curso de Verão"
              />
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
          </div>

          <Field label="Canais">
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((ch) => {
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

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Início">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Fim">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
            <Field label="Peças por canal">
              <Select
                value={String(perChannel)}
                onChange={(e) => setPerChannel(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-paper-500">
            {pieces.length} peça(s) geradas. Edite o que quiser e descarte as que não servirem —
            só as que ficarem viram card.
          </p>
          {pieces.map((p) => (
            <div
              key={p._id}
              className="rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-900 p-3"
            >
              <div className="mb-2 flex items-center gap-2">
                <Select
                  value={p.channel}
                  onChange={(e) => patchPiece(p._id, { channel: e.target.value })}
                  className="w-auto"
                >
                  {CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {CHANNEL_LABEL[ch]}
                    </option>
                  ))}
                </Select>
                <Input
                  type="date"
                  value={p.publish_date ?? ""}
                  onChange={(e) => patchPiece(p._id, { publish_date: e.target.value || null })}
                  className="w-auto"
                />
                {p.format_hint && (
                  <span className="rounded-full bg-paper-100 dark:bg-ink-800 px-2 py-0.5 text-[11px] text-paper-500">
                    {p.format_hint}
                  </span>
                )}
                <button
                  onClick={() => removePiece(p._id)}
                  className="ml-auto grid size-8 place-items-center rounded-lg text-paper-400 hover:bg-danger/10 hover:text-danger"
                  aria-label="Descartar peça"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <Input
                value={p.title}
                onChange={(e) => patchPiece(p._id, { title: e.target.value })}
                className="mb-2 font-medium"
                placeholder="Título da peça"
              />
              <Textarea
                rows={3}
                value={p.copy}
                onChange={(e) => patchPiece(p._id, { copy: e.target.value })}
                placeholder="Copy"
              />
            </div>
          ))}
          {pieces.length === 0 && (
            <p className="text-sm text-paper-400">
              Todas as peças foram descartadas. Volte ao briefing para gerar de novo.
            </p>
          )}
        </div>
      )}

      <p className="mt-4 text-[11px] text-paper-400">
        Projeto {projectKey} · datas caem automaticamente no Calendário editorial.
      </p>
    </Modal>
  )
}
