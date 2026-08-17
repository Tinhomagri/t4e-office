import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  FileText,
  Link2,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Paperclip,
  Plus,
  Send,
  Share2,
  Sparkles,
  Square,
  Tag,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import DatePicker, { registerLocale } from "react-datepicker"
import { ptBR } from "date-fns/locale"

registerLocale("pt-BR", ptBR)

import { GithubDevPanel } from "@/features/github/GithubDevPanel"
import { useAuthStore } from "@/features/auth/auth.store"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import * as copilotApi from "@/features/copilot/copilot.api"
import { useCopilotContextStore } from "@/features/copilot/copilot.context.store"
import {
  ReplySuggestions,
  SimilarSuggestions,
  SubtaskSuggestions,
} from "@/features/boards/CardAiSuggestions"
import { RepurposeDialog } from "./RepurposeDialog"
import { errMsg } from "./board.shared"
import {
  useAddCardComponent,
  useAddCardVersion,
  useAttachments,
  useCardComponents,
  useCardHistory,
  useCardLinks,
  useCardVersions,
  useCards,
  useComments,
  useComponents,
  useCreateCard,
  useCreateCardLink,
  useCreateComment,
  useCreateWorklog,
  useCustomFields,
  useDeleteAttachment,
  useDeleteCard,
  useDeleteCardLink,
  useDeleteWorklog,
  useEpics,
  useFieldValues,
  useRemoveCardComponent,
  useRemoveCardVersion,
  useApproveCard,
  useProjectPermissions,
  useUpdateCard,
  useUploadAttachment,
  useUploadAttachmentVersion,
  useUpsertFieldValue,
  useVersions,
  useWorklogs,
} from "@/features/workspace/workspace.hooks"
import type {
  Attachment,
  Card,
  CardHistoryEntry,
  CardPriority,
  CardStatus,
  CardType,
  Component,
  CustomField,
  FieldValue,
  IssueLink,
  LinkType,
  Member,
  Sprint,
  Version,
  Worklog,
} from "@/features/workspace/workspace.types"
import { Avatar, Badge, Button, cx, Skeleton } from "@/shared/ui/primitives"
import { StatusLozenge } from "@/shared/ui/issue"
import { RichEditor } from "@/shared/ui/RichEditor"
import { useQueryClient } from "@tanstack/react-query"
import * as wsApi from "@/features/workspace/workspace.api"
import { toast } from "@/shared/ui/toast"

const STATUS_LABEL: Record<CardStatus, string> = {
  backlog: "Backlog",
  todo: "A fazer",
  doing: "Em andamento",
  review: "Em revisão",
  done: "Concluído",
  briefing: "Briefing",
  criacao: "Criação",
  aprovacao: "Aprovação",
  agendado: "Agendado",
  publicado: "Publicado",
}
const TYPE_LABEL: Record<CardType, string> = {
  feature: "Feature",
  bug: "Bug",
  debt: "Débito",
  spike: "Spike",
  chore: "Tarefa",
  epic: "Epic",
  post: "Post",
  peca: "Peça",
  campanha: "Campanha",
  artigo: "Artigo",
  email: "E-mail",
}
const PRIORITY_LABEL: Record<CardPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
}
const STATUS_TONE: Record<CardStatus, "neutral" | "brand" | "warning" | "success"> = {
  backlog: "neutral",
  todo: "neutral",
  doing: "brand",
  review: "warning",
  done: "success",
  briefing: "neutral",
  criacao: "brand",
  aprovacao: "warning",
  agendado: "brand",
  publicado: "success",
}





const TYPE_ICON: Record<CardType, string> = {
  feature: "⚡", bug: "🐛", debt: "💳", spike: "🔬", chore: "🔧", epic: "🏔",
  post: "📣", peca: "🎨", campanha: "🚀", artigo: "📝", email: "✉️",
}

// Canais de marketing (campo do card em projetos campanha/social/conteúdo)
const CHANNEL_OPTIONS = [
  { value: "", label: "—" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "blog", label: "Blog" },
  { value: "email", label: "E-mail" },
  { value: "site", label: "Site" },
]

const AVATAR_GRADIENTS = [
  "from-violet-500 to-purple-700", "from-blue-500 to-indigo-700",
  "from-emerald-500 to-teal-700", "from-rose-500 to-pink-700",
  "from-amber-500 to-orange-700", "from-cyan-500 to-sky-700",
]
function avatarGradient(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length]
}

// Drawer de detalhe de card estilo Jira: 2 colunas (conteúdo + painel lateral).
export function CardDrawer({
  card,
  projectId,
  sprints,
  members,
  onClose,
}: {
  card: Card | null
  projectId: string
  sprints: Sprint[]
  members: Member[]
  onClose: () => void
}) {
  const updateCard = useUpdateCard(projectId)
  const deleteCard = useDeleteCard(projectId)
  const { can } = useProjectPermissions(projectId)
  const { data: allCards } = useCards(projectId)
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const [draft, setDraft] = useState<Card | null>(card)
  const [savedHint, setSavedHint] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => setDraft(card), [card])

  // Publica o card aberto como contexto do Copiloto — é o que faz "resuma
  // este card" funcionar sem a pessoa repetir o código do card por escrito.
  const setCopilotContext = useCopilotContextStore((s) => s.setContext)
  const clearCopilotContext = useCopilotContextStore((s) => s.clearContext)
  useEffect(() => {
    if (!card) return
    setCopilotContext("card", {
      label: `${card.ref} · ${card.title}`,
      hint:
        `O usuário está com o card ${card.ref} aberto ("${card.title}", ` +
        `card_id="${card.id}", projeto project_id="${projectId}"). Quando ele ` +
        `disser "este card" ou "esta tarefa", é deste que se trata.`,
    })
    return () => clearCopilotContext("card")
  }, [card, projectId, setCopilotContext, clearCopilotContext])

  if (!card || !draft) return null

  const set = <K extends keyof Card>(k: K, v: Card[K]) => setDraft({ ...draft, [k]: v })

  // Salva um campo imediatamente (autosave por campo, como o Jira).
  const persist = async (patch: Partial<Card>) => {
    await updateCard.mutateAsync({ cardId: card.id, input: patch })
    setSavedHint(true)
    setTimeout(() => setSavedHint(false), 1500)
  }

  const assignee = members.find((m) => m.user_id === draft.assignee_id)
  const reporter = members.find((m) => m.user_id === draft.reporter_id)
  const parent = draft.parent_id ? (allCards ?? []).find((c) => c.id === draft.parent_id) : undefined
  const createdAgo = timeAgo(card.created_at)
  const updatedAgo = timeAgo(card.updated_at)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?card=${card.id}`)
      toast.success("Link copiado")
    } catch {
      toast.error("Não foi possível copiar o link")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center p-0 sm:p-4">
      <motion.div
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm pointer-events-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onMouseDown={(e) => {
          // Fecha apenas se o clique for realmente no overlay (não em inputs/datepicker)
          if (e.target === e.currentTarget) onClose()
        }}
      />
      <motion.div
        // Painel "puxado" da direita com leve escala — pega e assenta (tátil).
        initial={{ opacity: 0, x: 48, scale: 0.985 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 48, scale: 0.985 }}
        transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.9 }}
        className={cx(
          // No dark o modal usa a superfície `overlay` (ink-750) e a sombra
          // com anel de 1px — é ela que separa o painel do fundo, já que a
          // borda sólida some contra a página escura.
          "relative z-10 flex h-full w-full flex-col overflow-hidden rounded-none border-paper-200 bg-white text-ink shadow-xl dark:border-transparent dark:bg-ink-750 dark:text-ink-200 dark:shadow-overlay sm:h-auto sm:max-h-[92vh] sm:rounded-[12px] sm:border will-change-transform",
          expanded ? "max-w-[1400px]" : "max-w-5xl",
        )}>
        {/* Cabeçalho: trilha pai/filho à esquerda, ferramentas à direita */}
        <div className="flex items-center justify-between gap-3 border-b border-paper-200 dark:border-ink-700 px-4 py-2 bg-white dark:bg-ink-750">
            <nav aria-label="Trilha" className="flex min-w-0 items-center gap-1.5 text-xs">
              {parent ? (
                <>
                  <span className="flex items-center gap-1 truncate text-paper-500">
                    <span aria-hidden>{TYPE_ICON[parent.type]}</span>
                    <span className="font-mono">{parent.ref}</span>
                  </span>
                  <span className="text-paper-300" aria-hidden>/</span>
                </>
              ) : draft.epic_id ? (
                <>
                  <EpicBadge projectId={projectId} epicId={draft.epic_id} />
                  <span className="text-paper-300" aria-hidden>/</span>
                </>
              ) : null}
              <span className="flex items-center gap-1 font-medium text-ink dark:text-paper">
                <span aria-hidden>{TYPE_ICON[draft.type]}</span>
                <span className="font-mono">{card.ref}</span>
              </span>

              {savedHint && (
                <span className="ml-2 flex items-center gap-1 text-xs font-medium text-success animate-fade-in">
                  ✓ salvo
                </span>
              )}
              {updateCard.isPending && <Loader2 className="ml-2 size-3.5 animate-spin text-paper-400" />}
            </nav>

          <div className="flex shrink-0 items-center gap-0.5">
            <ToolbarButton label="Copiar link" onClick={copyLink}>
              <Share2 className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label={expanded ? "Recolher" : "Expandir"}
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </ToolbarButton>
            {can("delete_issue") && (
              <ToolbarButton
                label="Deletar card"
                onClick={() => setConfirmingDelete(true)}
                className="text-danger-500 hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/10"
              >
                <Trash2 className="size-4" />
              </ToolbarButton>
            )}
            <ToolbarButton label="Fechar" onClick={onClose}>
              <X className="size-4" />
            </ToolbarButton>
          </div>
        </div>

        {/* Corpo: 2 colunas */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto scrollbar-slim lg:grid-cols-[1fr_340px]">
          {/* Coluna principal */}
          <div className="min-w-0 space-y-6 p-5">
            <input
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              onBlur={() => draft.title !== card.title && persist({ title: draft.title })}
              className="-mx-2 w-[calc(100%+1rem)] rounded-lg border border-transparent bg-transparent text-[28px] font-semibold leading-8 text-ink dark:text-ink-200 outline-none transition-colors hover:bg-paper-50 dark:hover:bg-ink-800 focus:border-brand-300 focus:bg-paper dark:focus:bg-ink-800 px-2 py-1"
            />

            <Section title="Descrição">
              <RichEditor
                value={draft.description}
                onChange={(html) => set("description", html)}
                placeholder="Adicione uma descrição detalhada…"
                // Sem workspace ativo não há IA configurada para chamar, então
                // o menu de IA nem aparece.
                onAiAssist={
                  workspaceId
                    ? (text, action, target) =>
                        copilotApi.writeAssist(workspaceId, text, action, "", target)
                    : undefined
                }
              />
              {draft.description !== card.description && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => persist({ description: draft.description })} loading={updateCard.isPending}>
                    Salvar descrição
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => set("description", card.description)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </Section>

            {MARKETING_TYPES.has(draft.type) && (
              <>
                <CopyGenerator card={draft} onUse={(text) => { set("description", text); persist({ description: text }) }} />
                {draft.description && <RepurposeAction card={draft} projectId={projectId} />}
                <MetricsEditor card={draft} projectId={projectId} />
              </>
            )}

            <Subtasks parentCard={card} projectId={projectId} />

            <Links card={card} projectId={projectId} />

            <Versions cardId={card.id} projectId={projectId} />

            <Components cardId={card.id} projectId={projectId} />

            <WorklogSection cardId={card.id} />

            <Attachments cardId={card.id} />

            <CustomFields cardId={card.id} projectId={projectId} />

            <Activity cardId={card.id} members={members} />
          </div>

          {/* Painel lateral de detalhes */}
          {/* No dark a coluna não muda de cor: o que a separa são os painéis
              com borda dentro dela, como no Jira. Um tom diferente aqui criaria
              uma faixa vertical que o original não tem. */}
          <aside className="space-y-2.5 border-t border-paper-200 bg-paper-50 p-3 dark:border-ink-700 dark:bg-transparent lg:border-l lg:border-t-0">
            {/* Ação primária: status sólido, como no Jira */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusDropdown
                variant="solid"
                value={draft.status}
                onChange={(v) => {
                  set("status", v)
                  persist({ status: v })
                }}
              />
              {card.points != null && (
                <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700 ring-1 ring-brand-200">
                  🃏 peso {card.points}
                </span>
              )}
            </div>

            <SidePanel title="Informações">
            <DetailRow label="Responsável">
              <PersonSelect
                value={draft.assignee_id}
                members={members}
                person={assignee}
                onChange={(v) => {
                  set("assignee_id", v)
                  persist({ assignee_id: v })
                }}
              />
            </DetailRow>

            <DetailRow label="Relator">
              <PersonSelect
                value={draft.reporter_id}
                members={members}
                person={reporter}
                onChange={(v) => {
                  set("reporter_id", v)
                  persist({ reporter_id: v })
                }}
              />
            </DetailRow>

            <DetailRow label="Pai">
              {parent ? (
                <span
                  className="inline-flex max-w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: parent.epic_color || "#626F86" }}
                  title={parent.title}
                >
                  <span className="font-mono">{parent.ref}</span>
                  <span className="truncate">{parent.title}</span>
                </span>
              ) : (
                <span className="pt-1.5 text-sm text-paper-400">Nenhum</span>
              )}
            </DetailRow>

            <DetailSelect
              label="Tipo"
              value={draft.type}
              onChange={(v) => {
                set("type", v as CardType)
                persist({ type: v as CardType })
              }}
              options={(Object.keys(TYPE_LABEL) as CardType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
            />

            <DetailSelect
              label="Prioridade"
              value={draft.priority}
              onChange={(v) => {
                set("priority", v as CardPriority)
                persist({ priority: v as CardPriority })
              }}
              options={(Object.keys(PRIORITY_LABEL) as CardPriority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
            />

            <DetailRow label="Peso">
              <input
                type="number"
                min={0}
                value={draft.points ?? ""}
                onChange={(e) => set("points", e.target.value === "" ? null : Number(e.target.value))}
                onBlur={() => draft.points !== card.points && persist({ points: draft.points })}
                placeholder="—"
                className={cx(FIELD_INLINE, "h-8")}
              />
            </DetailRow>

            <DetailSelect
              label="Sprint"
              value={draft.sprint_id ?? ""}
              onChange={(v) => {
                set("sprint_id", v || null)
                persist({ sprint_id: v || null })
              }}
              options={[{ value: "", label: "Backlog" }, ...sprints.map((s) => ({ value: s.id, label: s.name }))]}
            />

            {draft.type !== "epic" && (
              <EpicSelect
                projectId={projectId}
                value={draft.epic_id}
                onChange={(v) => {
                  set("epic_id", v)
                  persist({ epic_id: v })
                }}
              />
            )}

            <DetailRow label="Início">
              <DateInput
                value={draft.start_date}
                onChange={(v) => { set("start_date", v); persist({ start_date: v }) }}
              />
            </DetailRow>

            <DetailRow label="Prazo">
              <DateInput
                value={draft.due_date}
                onChange={(v) => { set("due_date", v); persist({ due_date: v }) }}
              />
            </DetailRow>

            <DetailSelect
              label="Canal"
              value={draft.channel ?? ""}
              onChange={(v) => {
                set("channel", v)
                persist({ channel: v })
              }}
              options={CHANNEL_OPTIONS}
            />

            <DetailRow label="Publicação">
              <DateInput
                value={draft.publish_date ?? null}
                onChange={(v) => { set("publish_date", v); persist({ publish_date: v }) }}
              />
            </DetailRow>

            {draft.status === "aprovacao" && (
              <ApprovalPanel card={card} projectId={projectId} />
            )}

            <Labels
              value={draft.labels ?? []}
              onChange={(next) => {
                set("labels", next)
                persist({ labels: next })
              }}
            />
            </SidePanel>

            <SidePanel title="Desenvolvimento" defaultOpen={false}>
              <GithubDevPanel cardId={card.id} projectId={projectId} />
            </SidePanel>

            {(createdAgo || updatedAgo) && (
              <div className="px-1 pt-1 text-xs leading-relaxed text-paper-400 dark:text-ink-400">
                {createdAgo && <p>Criado {createdAgo}</p>}
                {updatedAgo && <p>Atualizado {updatedAgo}</p>}
              </div>
            )}
          </aside>
        </div>
      </motion.div>

      {confirmingDelete && (
        <DeleteCardModal
          card={card}
          isDeleting={deleteCard.isPending}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            try {
              await deleteCard.mutateAsync(card.id)
              toast.success(`${card.ref} deletado`)
              onClose()
            } catch (e) {
              toast.error(errMsg(e))
            }
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Copy com IA (marketing) — gera variações de legenda por canal via copiloto
// ---------------------------------------------------------------------------
const MARKETING_TYPES = new Set<CardType>(["post", "peca", "campanha", "artigo", "email"])

const TONE_OPTIONS: { value: copilotApi.CopyTone; label: string }[] = [
  { value: "", label: "Tom automático" },
  { value: "institucional", label: "Institucional" },
  { value: "descontraido", label: "Descontraído" },
  { value: "urgente", label: "Urgente / CTA" },
  { value: "educativo", label: "Educativo" },
  { value: "inspirador", label: "Inspirador" },
]

// Editor de métricas de desempenho de uma peça publicada (entrada manual).
const METRIC_FIELDS: { key: string; label: string }[] = [
  { key: "reach", label: "Alcance" },
  { key: "impressions", label: "Impressões" },
  { key: "likes", label: "Curtidas" },
  { key: "comments", label: "Comentários" },
  { key: "shares", label: "Compart." },
  { key: "clicks", label: "Cliques" },
  { key: "conversions", label: "Conversões" },
]

function MetricsEditor({ card, projectId }: { card: Card; projectId: string }) {
  const qc = useQueryClient()
  const [values, setValues] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    void wsApi.getCardMetrics(card.id).then((m) => {
      if (!alive) return
      const next: Record<string, number> = {}
      for (const f of METRIC_FIELDS) next[f.key] = (m as unknown as Record<string, number>)[f.key] ?? 0
      setValues(next)
    })
    return () => {
      alive = false
    }
  }, [card.id])

  const save = async () => {
    setSaving(true)
    try {
      await wsApi.saveCardMetrics(card.id, values)
      qc.invalidateQueries({ queryKey: ["marketing-report", projectId] })
      toast.success("Métricas salvas")
    } catch {
      toast.error("Falha ao salvar métricas.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title="Desempenho 📊">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {METRIC_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-0.5 block text-[11px] text-paper-500">{f.label}</span>
            <input
              type="number"
              min={0}
              value={values[f.key] ?? 0}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: Math.max(0, Number(e.target.value) || 0) }))
              }
              className="w-full rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-2 py-1 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
            />
          </label>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={save} loading={saving} className="mt-2">
        Salvar métricas
      </Button>
    </Section>
  )
}

// Ação "Espalhar em canais" (repurpose 1→N) para peças de marketing.
function RepurposeAction({ card, projectId }: { card: Card; projectId: string }) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const [open, setOpen] = useState(false)
  if (!workspaceId) return null
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        📣 Espalhar em canais
      </Button>
      {open && (
        <RepurposeDialog
          open={open}
          onClose={() => setOpen(false)}
          card={card}
          projectId={projectId}
          workspaceId={workspaceId}
        />
      )}
    </>
  )
}

function CopyGenerator({ card, onUse }: { card: Card; onUse: (text: string) => void }) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const [variations, setVariations] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tone, setTone] = useState<copilotApi.CopyTone>("")
  const [hashtags, setHashtags] = useState(true)
  const [adaptChannel, setAdaptChannel] = useState("")

  const generate = async (sourceCopy = "", channelOverride = "") => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const res = await copilotApi.generateCopy(
        workspaceId,
        card.title,
        card.description ?? "",
        channelOverride || card.channel || "instagram",
        { tone, includeHashtags: hashtags, sourceCopy },
      )
      setVariations(res.variations)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }

  const selectClass =
    "rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-2 py-1 text-xs text-ink dark:text-paper outline-none focus:border-brand-400"

  return (
    <Section title="Copy com IA ✨">
      <div className="space-y-2">
        {/* Controles avançados: tom de voz, hashtags e adaptação de canal */}
        <div className="flex flex-wrap items-center gap-2">
          <select value={tone} onChange={(e) => setTone(e.target.value as copilotApi.CopyTone)} className={selectClass} aria-label="Tom de voz">
            {TONE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-paper-500 dark:text-paper-400 cursor-pointer">
            <input type="checkbox" checked={hashtags} onChange={(e) => setHashtags(e.target.checked)} className="accent-brand-500" />
            Hashtags
          </label>
          {card.description && (
            <select
              value={adaptChannel}
              onChange={(e) => {
                const target = e.target.value
                setAdaptChannel(target)
                if (target) void generate(card.description ?? "", target)
              }}
              className={selectClass}
              aria-label="Adaptar copy para outro canal"
            >
              <option value="">Adaptar para…</option>
              {CHANNEL_OPTIONS.filter((c) => c.value && c.value !== card.channel).map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          )}
        </div>
        {variations.map((v, i) => (
          <div key={i} className="rounded-lg border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-950/40 p-2.5">
            <p className="whitespace-pre-wrap text-sm text-ink dark:text-paper">{v}</p>
            <div className="mt-1.5 flex gap-2">
              <button
                onClick={() => onUse(v)}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Usar como descrição
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(v)}
                className="text-xs font-medium text-paper-400 hover:text-ink dark:hover:text-paper"
              >
                Copiar
              </button>
            </div>
          </div>
        ))}
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button size="sm" variant="ghost" onClick={() => void generate()} loading={loading}>
          ✨ {variations.length ? "Gerar novamente" : `Gerar copy para ${card.channel || "o canal"}`}
        </Button>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Aprovação de peça (marketing) — visível quando o card está em "Aprovação"
// ---------------------------------------------------------------------------
function ApprovalPanel({ card, projectId }: { card: Card; projectId: string }) {
  const approve = useApproveCard(projectId, card.id)
  const [comment, setComment] = useState("")
  const [rejecting, setRejecting] = useState(false)

  const decide = (decision: "approved" | "rejected") => {
    approve.mutate({ decision, comment })
    setComment("")
    setRejecting(false)
  }

  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-warning">
        Aprovação pendente
      </p>
      {rejecting && (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Motivo da reprovação (obrigatório)…"
          rows={2}
          className="w-full rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400"
        />
      )}
      <div className="flex gap-2">
        {rejecting ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => decide("rejected")}
              disabled={!comment.trim()}
              loading={approve.isPending}
              className="text-danger"
            >
              Confirmar reprovação
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={() => decide("approved")} loading={approve.isPending}>
              ✓ Aprovar
            </Button>
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRejecting(true)}>
              ✕ Reprovar
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subtarefas (cards filhos via parent_id) — hit no backend
// ---------------------------------------------------------------------------
function Subtasks({ parentCard, projectId }: { parentCard: Card; projectId: string }) {
  const { data: cards } = useCards(projectId)
  const createCard = useCreateCard(projectId)
  const updateCard = useUpdateCard(projectId)
  const [title, setTitle] = useState("")
  const [adding, setAdding] = useState(false)
  const [suggesting, setSuggesting] = useState(false)

  const children = (cards ?? []).filter((c) => c.parent_id === parentCard.id)
  const doneN = children.filter((c) => c.status === "done").length
  const pct = children.length ? Math.round((doneN / children.length) * 100) : 0

  const add = async () => {
    const t = title.trim()
    if (!t) return
    setTitle("")
    setAdding(false)
    await createCard.mutateAsync({
      title: t,
      type: "chore",
      parent_id: parentCard.id,
      sprint_id: parentCard.sprint_id,
    })
  }

  const toggle = (c: Card) =>
    updateCard.mutate({
      cardId: c.id,
      input: { status: c.status === "done" ? "todo" : "done" },
    })

  return (
    <Section title={`Subtarefas${children.length ? ` (${doneN}/${children.length})` : ""}`}>
      {children.length > 0 && (
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <ul className="space-y-1">
        {children.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 px-2.5 py-1.5">
            <button onClick={() => toggle(c)} className="text-paper-400 hover:text-success">
              {c.status === "done" ? (
                <CheckSquare className="size-4 text-success" />
              ) : (
                <Square className="size-4" />
              )}
            </button>
            <span className="font-mono text-[11px] text-paper-400">{c.ref}</span>
            <span className={cx("flex-1 truncate text-sm", c.status === "done" ? "text-paper-400 line-through" : "text-ink dark:text-paper")}>
              {c.title}
            </span>
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") setAdding(false) }}
            placeholder="Título da subtarefa"
            className="flex-1 rounded-lg border border-paper-300 bg-paper dark:bg-ink-800 px-2.5 py-1.5 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
          />
          <Button size="sm" onClick={add} loading={createCard.isPending} disabled={!title.trim()}>Adicionar</Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus className="size-4" /> Adicionar subtarefa
          </button>
          {!suggesting && (
            <button
              onClick={() => setSuggesting(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Sparkles className="size-3.5" /> Sugerir com IA
            </button>
          )}
        </div>
      )}
      {suggesting && (
        <SubtaskSuggestions
          card={parentCard}
          onDismiss={() => setSuggesting(false)}
          // Cria em série: o backend numera o card por projeto, e disparar
          // tudo em paralelo faria duas subtarefas brigarem pelo mesmo número.
          onCreate={async (titles) => {
            for (const t of titles) {
              await createCard.mutateAsync({
                title: t,
                type: "chore",
                parent_id: parentCard.id,
                sprint_id: parentCard.sprint_id,
              })
            }
          }}
        />
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Vínculos entre cards (issue links) — hit no backend
// ---------------------------------------------------------------------------
const LINK_LABEL: Record<LinkType, { outgoing: string; incoming: string }> = {
  relates: { outgoing: "Relacionado a", incoming: "Relacionado a" },
  blocks: { outgoing: "Bloqueia", incoming: "Bloqueado por" },
  duplicates: { outgoing: "Duplica", incoming: "Duplicado por" },
}

function Links({ card, projectId }: { card: Card; projectId: string }) {
  const { data: links } = useCardLinks(card.id)
  const { data: cards } = useCards(projectId)
  const createLink = useCreateCardLink(card.id)
  const deleteLink = useDeleteCardLink(card.id)
  const [adding, setAdding] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [type, setType] = useState<LinkType>("relates")
  const [targetId, setTargetId] = useState("")

  const candidates = (cards ?? []).filter(
    (c) => c.id !== card.id && c.parent_id !== card.id,
  )

  const add = async () => {
    if (!targetId) return
    await createLink.mutateAsync({ target_id: targetId, link_type: type })
    setTargetId("")
    setAdding(false)
  }

  // Agrupa por rótulo direcional.
  const grouped: Record<string, IssueLink[]> = {}
  for (const l of links ?? []) {
    const label = LINK_LABEL[l.link_type][l.direction]
    ;(grouped[label] ??= []).push(l)
  }

  return (
    <Section title="Vínculos">
      {Object.keys(grouped).length === 0 && !adding && (
        <p className="text-sm text-paper-400">Nenhum vínculo.</p>
      )}
      <div className="space-y-3">
        {Object.entries(grouped).map(([label, items]) => (
          <div key={label}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-paper-400">{label}</p>
            <ul className="space-y-1">
              {items.map((l) => (
                <li key={l.id} className="flex items-center gap-2 rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 px-2.5 py-1.5">
                  <Link2 className="size-3.5 shrink-0 text-paper-400" />
                  <span className="font-mono text-[11px] text-paper-400">{l.other_card?.ref}</span>
                  <span className="flex-1 truncate text-sm text-ink dark:text-paper">{l.other_card?.title ?? "—"}</span>
                  {l.other_card && (
                    <Badge tone={STATUS_TONE[l.other_card.status]}>{STATUS_LABEL[l.other_card.status]}</Badge>
                  )}
                  <button onClick={() => deleteLink.mutate(l.id)} className="text-paper-300 hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LinkType)}
            className="rounded-lg border border-paper-300 bg-paper dark:bg-ink-800 px-2 py-1.5 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
          >
            <option value="relates">Relacionado a</option>
            <option value="blocks">Bloqueia</option>
            <option value="duplicates">Duplica</option>
          </select>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="min-w-[160px] flex-1 rounded-lg border border-paper-300 bg-paper dark:bg-ink-800 px-2 py-1.5 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
          >
            <option value="">Selecione o card…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.ref} · {c.title}</option>
            ))}
          </select>
          <Button size="sm" onClick={add} loading={createLink.isPending} disabled={!targetId}>Vincular</Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus className="size-4" /> Adicionar vínculo
          </button>
          {!suggesting && (
            <button
              onClick={() => setSuggesting(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Sparkles className="size-3.5" /> Buscar semelhantes
            </button>
          )}
        </div>
      )}
      {suggesting && (
        <SimilarSuggestions
          card={card}
          onDismiss={() => setSuggesting(false)}
          onLink={async (rows) => {
            for (const r of rows) await createLink.mutateAsync(r)
          }}
        />
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Versões (fix versions do card) — hit no backend
// ---------------------------------------------------------------------------
function Versions({ cardId, projectId }: { cardId: string; projectId: string }) {
  const { data: cardVersions } = useCardVersions(cardId)
  const { data: allVersions } = useVersions(projectId)
  const addVersion = useAddCardVersion(cardId)
  const removeVersion = useRemoveCardVersion(cardId)
  const [selectedId, setSelectedId] = useState("")

  const assignedIds = new Set((cardVersions ?? []).map((v) => v.id))
  const available = (allVersions ?? []).filter((v) => !assignedIds.has(v.id))

  const add = async () => {
    if (!selectedId) return
    await addVersion.mutateAsync(selectedId)
    setSelectedId("")
  }

  return (
    <Section title="Versões">
      {(cardVersions ?? []).length === 0 && (
        <p className="text-sm text-paper-400">Nenhuma versão atribuída.</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {(cardVersions ?? []).map((v: Version) => (
          <span
            key={v.id}
            className="flex items-center gap-1 rounded-full border border-paper-300 bg-paper dark:bg-ink-800 px-2.5 py-0.5 text-[11px] font-medium text-ink dark:text-paper"
          >
            {v.name}
            {v.released && <span className="ml-0.5 text-[9px] text-success-600 font-bold">✓</span>}
            <button
              onClick={() => removeVersion.mutate(v.id)}
              className="ml-0.5 text-paper-300 hover:text-danger"
            >
              <X className="size-2.5" />
            </button>
          </span>
        ))}
      </div>
      {available.length > 0 && (
        <div className="mt-2 flex gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 rounded-lg border border-paper-300 bg-paper dark:bg-ink-800 px-2 py-1.5 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
          >
            <option value="">Selecione versão…</option>
            {available.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <Button size="sm" onClick={add} loading={addVersion.isPending} disabled={!selectedId}>
            Adicionar
          </Button>
        </div>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Componentes do card — hit no backend
// ---------------------------------------------------------------------------
function Components({ cardId, projectId }: { cardId: string; projectId: string }) {
  const { data: cardComponents } = useCardComponents(cardId)
  const { data: allComponents } = useComponents(projectId)
  const addComponent = useAddCardComponent(cardId)
  const removeComponent = useRemoveCardComponent(cardId)
  const [selectedId, setSelectedId] = useState("")

  const assignedIds = new Set((cardComponents ?? []).map((c) => c.id))
  const available = (allComponents ?? []).filter((c) => !assignedIds.has(c.id))

  const add = async () => {
    if (!selectedId) return
    await addComponent.mutateAsync(selectedId)
    setSelectedId("")
  }

  return (
    <Section title="Componentes">
      {(cardComponents ?? []).length === 0 && (
        <p className="text-sm text-paper-400">Nenhum componente atribuído.</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {(cardComponents ?? []).map((c: Component) => (
          <span
            key={c.id}
            className="flex items-center gap-1 rounded-full border border-paper-300 bg-paper dark:bg-ink-800 px-2.5 py-0.5 text-[11px] font-medium text-ink dark:text-paper"
          >
            {c.name}
            <button
              onClick={() => removeComponent.mutate(c.id)}
              className="ml-0.5 text-paper-300 hover:text-danger"
            >
              <X className="size-2.5" />
            </button>
          </span>
        ))}
      </div>
      {available.length > 0 && (
        <div className="mt-2 flex gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 rounded-lg border border-paper-300 bg-paper dark:bg-ink-800 px-2 py-1.5 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
          >
            <option value="">Selecione componente…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <Button size="sm" onClick={add} loading={addComponent.isPending} disabled={!selectedId}>
            Adicionar
          </Button>
        </div>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Custom Fields — leitura + upsert por campo, hit no backend
// ---------------------------------------------------------------------------
function FieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const str = value == null ? "" : String(value)

  switch (field.field_type) {
    case "text":
      return (
        <input
          value={str}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-paper-300 bg-paper dark:bg-ink-800 px-2 py-1 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
        />
      )
    case "number":
      return (
        <input
          type="number"
          value={str}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="w-full rounded-lg border border-paper-300 bg-paper dark:bg-ink-800 px-2 py-1 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
        />
      )
    case "date":
      return (
        <input
          type="date"
          value={str}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full rounded-lg border border-paper-300 bg-paper dark:bg-ink-800 px-2 py-1 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
        />
      )
    case "checkbox":
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 cursor-pointer rounded accent-brand-500"
        />
      )
    case "select":
      return (
        <select
          value={str}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full rounded-lg border border-paper-300 bg-paper dark:bg-ink-800 px-2 py-1 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
        >
          <option value="">—</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    case "multiselect": {
      const selected: string[] = Array.isArray(value) ? (value as string[]) : []
      return (
        <div className="flex flex-wrap gap-1">
          {field.options.map((o) => {
            const active = selected.includes(o)
            return (
              <button
                key={o}
                onClick={() => onChange(active ? selected.filter((x) => x !== o) : [...selected, o])}
                className={cx(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors",
                  active
                    ? "border-brand-400 bg-brand-50 text-brand-700"
                    : "border-paper-300 bg-paper dark:bg-ink-800 text-paper-500 hover:border-paper-400",
                )}
              >
                {o}
              </button>
            )
          })}
        </div>
      )
    }
    default:
      return <span className="text-sm text-paper-400">—</span>
  }
}

function CustomFields({ cardId, projectId }: { cardId: string; projectId: string }) {
  const { data: fields } = useCustomFields(projectId)
  const { data: values } = useFieldValues(cardId)
  const upsert = useUpsertFieldValue(cardId)

  if (!fields || fields.length === 0) return null

  const valueMap = new Map<string, FieldValue>((values ?? []).map((v) => [v.field_id, v]))

  return (
    <Section title="Campos personalizados">
      <div className="space-y-2">
        {fields.map((f: CustomField) => {
          const fv = valueMap.get(f.id)
          const current = fv?.value_json ?? null
          return (
            <DetailRow key={f.id} label={f.name}>
              <FieldInput
                field={f}
                value={current}
                onChange={(v) => upsert.mutate({ fieldId: f.id, value: v })}
              />
            </DetailRow>
          )
        })}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Attachments (anexos) — upload multipart, hit no backend
// ---------------------------------------------------------------------------
function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(mime: string) {
  if (mime.startsWith("image/")) return <Paperclip className="size-4 text-brand-400" />
  return <FileText className="size-4 text-paper-400" />
}

function Attachments({ cardId }: { cardId: string }) {
  const { data: attachments } = useAttachments(cardId)
  const upload = useUploadAttachment(cardId)
  const uploadVersion = useUploadAttachmentVersion(cardId)
  const del = useDeleteAttachment(cardId)
  const user = useAuthStore((s) => s.user)
  const inputRef = useRef<HTMLInputElement>(null)
  // Anexo alvo de "nova versão" — quando setado, o próximo arquivo vira v(N+1).
  const versionTargetRef = useRef<string | null>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const target = versionTargetRef.current
    versionTargetRef.current = null
    if (target) await uploadVersion.mutateAsync({ attachmentId: target, file })
    else await upload.mutateAsync(file)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <Section title={`Anexos${(attachments ?? []).length > 0 ? ` (${attachments!.length})` : ""}`}>
      {(attachments ?? []).length === 0 && !upload.isPending && (
        <p className="text-sm text-paper-400">Nenhum anexo.</p>
      )}
      <ul className="mb-2 space-y-1.5">
        {(attachments ?? []).map((a: Attachment) => (
          <li key={a.id} className="flex items-center gap-2 rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 px-2.5 py-1.5">
            {fileIcon(a.mime_type)}
            <div className="min-w-0 flex-1">
              {a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-sm font-medium text-brand-600 hover:underline"
                >
                  {a.filename}
                </a>
              ) : (
                <span className="truncate text-sm font-medium text-ink dark:text-paper">{a.filename}</span>
              )}
              <p className="text-[11px] text-paper-400">
                {fmtFileSize(a.size)} · {fmtDateTime(a.created_at)}
              </p>
            </div>
            {a.version > 1 && (
              <span className="shrink-0 rounded-full bg-paper-100 dark:bg-ink-800 px-1.5 py-0.5 text-[10px] font-semibold text-paper-500">
                v{a.version}
              </span>
            )}
            {a.approval_status === "approved" && (
              <span className="shrink-0 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                Aprovado
              </span>
            )}
            {a.approval_status === "rejected" && (
              <span className="shrink-0 rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                Reprovado
              </span>
            )}
            <button
              onClick={() => { versionTargetRef.current = a.id; inputRef.current?.click() }}
              title="Enviar nova versão desta peça"
              className="shrink-0 text-[11px] font-medium text-brand-600 hover:text-brand-700"
            >
              + versão
            </button>
            {a.author_id === user?.id && (
              <button
                onClick={() => del.mutate(a.id)}
                className="shrink-0 text-paper-300 hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
        {upload.isPending && (
          <li className="flex items-center gap-2 rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 px-2.5 py-1.5 text-sm text-paper-400">
            <Loader2 className="size-4 animate-spin" /> Enviando…
          </li>
        )}
      </ul>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
        className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
      >
        <Paperclip className="size-4" /> Anexar arquivo
      </button>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Worklogs (registro de tempo) — hit no backend
// ---------------------------------------------------------------------------
function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function parseDuration(input: string): number | null {
  // aceita: "1h30m", "90m", "2h", "3600"
  const trimmed = input.trim().toLowerCase()
  const full = trimmed.match(/^(\d+)h\s*(\d+)m$/)
  if (full) return parseInt(full[1]) * 3600 + parseInt(full[2]) * 60
  const hoursOnly = trimmed.match(/^(\d+)h$/)
  if (hoursOnly) return parseInt(hoursOnly[1]) * 3600
  const minsOnly = trimmed.match(/^(\d+)m$/)
  if (minsOnly) return parseInt(minsOnly[1]) * 60
  const secsOnly = trimmed.match(/^\d+$/)
  if (secsOnly) return parseInt(trimmed)
  return null
}

function WorklogSection({ cardId }: { cardId: string }) {
  const { data: worklogs } = useWorklogs(cardId)
  const createWorklog = useCreateWorklog(cardId)
  const deleteWorklog = useDeleteWorklog(cardId)
  const user = useAuthStore((s) => s.user)

  const [adding, setAdding] = useState(false)
  const [timeInput, setTimeInput] = useState("")
  const [comment, setComment] = useState("")

  const total = (worklogs ?? []).reduce((acc, w) => acc + w.time_seconds, 0)

  const save = async () => {
    const secs = parseDuration(timeInput)
    if (!secs || secs <= 0) return
    await createWorklog.mutateAsync({ time_seconds: secs, comment: comment.trim() || undefined })
    setTimeInput("")
    setComment("")
    setAdding(false)
  }

  return (
    <Section title={`Registro de tempo${total > 0 ? ` · ${fmtDuration(total)}` : ""}`}>
      {(worklogs ?? []).length === 0 && !adding && (
        <p className="text-sm text-paper-400">Nenhum registro.</p>
      )}
      {(worklogs ?? []).length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {(worklogs ?? []).map((w: Worklog) => (
            <li key={w.id} className="flex items-start gap-2 rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 px-2.5 py-1.5">
              <Avatar initials={initials(w.author_name)} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-ink dark:text-paper">{fmtDuration(w.time_seconds)}</span>
                  <span className="text-[11px] text-paper-400">por {w.author_name}</span>
                  <span className="text-[11px] text-paper-400">· {fmtDateTime(w.started_at)}</span>
                </div>
                {w.comment && <p className="text-[13px] text-paper-600">{w.comment}</p>}
              </div>
              {w.author_id === user?.id && (
                <button
                  onClick={() => deleteWorklog.mutate(w.id)}
                  className="text-paper-300 hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              placeholder="ex: 1h30m, 45m, 2h"
              className="w-32 rounded-lg border border-paper-300 bg-paper dark:bg-ink-800 px-2 py-1.5 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
            />
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comentário (opcional)"
              className="flex-1 rounded-lg border border-paper-300 bg-paper dark:bg-ink-800 px-2 py-1.5 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} loading={createWorklog.isPending} disabled={!timeInput.trim()}>
              Registrar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setTimeInput(""); setComment("") }}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-1 flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <Plus className="size-4" /> Registrar tempo
        </button>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Labels (chips editáveis no card)
// ---------------------------------------------------------------------------
function Labels({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [input, setInput] = useState("")

  const add = () => {
    const t = input.trim().toLowerCase()
    if (!t || value.includes(t)) { setInput(""); return }
    onChange([...value, t])
    setInput("")
  }
  const remove = (l: string) => onChange(value.filter((x) => x !== l))

  return (
    <DetailRow label="Labels">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((l) => (
          <span key={l} className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
            <Tag className="size-2.5" />
            {l}
            <button onClick={() => remove(l)} className="text-brand-400 hover:text-brand-700">
              <X className="size-2.5" />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          onBlur={add}
          placeholder="+ label"
          className="w-20 bg-transparent text-xs text-ink dark:text-paper outline-none placeholder-paper-400"
        />
      </div>
    </DetailRow>
  )
}

// ---------------------------------------------------------------------------
// Atividade / comentários (hit no backend)
// ---------------------------------------------------------------------------
const FIELD_LABEL: Record<string, string> = {
  title: "Título",
  status: "Status",
  type: "Tipo",
  priority: "Prioridade",
  points: "Peso",
  assignee_id: "Responsável",
  reporter_id: "Relator",
  sprint_id: "Sprint",
  start_date: "Início",
  due_date: "Prazo",
  parent_id: "Card pai",
  epic_id: "Epic",
  labels: "Labels",
}
// Campos cujo valor é um id/uuid — não mostrar o valor cru.
const OPAQUE_FIELDS = new Set([
  "assignee_id",
  "reporter_id",
  "sprint_id",
  "parent_id",
  "epic_id",
])

function HistoryLine({ h }: { h: CardHistoryEntry }) {
  const label = FIELD_LABEL[h.field] ?? h.field
  const opaque = OPAQUE_FIELDS.has(h.field)
  return (
    <li className="flex gap-2.5">
      <Avatar initials={initials(h.author_name)} size="sm" />
      <div className="min-w-0 flex-1 pt-0.5 text-[13px] text-paper-600">
        <span className="font-medium text-ink dark:text-paper">{h.author_name || "Alguém"}</span>{" "}
        alterou <span className="font-medium">{label}</span>
        {opaque ? (
          ""
        ) : (
          <>
            {": "}
            <span className="text-paper-400 line-through">{h.old_value || "—"}</span>{" "}
            → <span className="text-ink dark:text-paper">{h.new_value || "—"}</span>
          </>
        )}
        <span className="ml-1.5 text-[11px] text-paper-400">{fmtDateTime(h.created_at)}</span>
      </div>
    </li>
  )
}

function Activity({ cardId, members }: { cardId: string; members: Member[] }) {
  const user = useAuthStore((s) => s.user)
  const { data: comments, isLoading } = useComments(cardId)
  const { data: history } = useCardHistory(cardId)
  const createComment = useCreateComment(cardId)
  const [body, setBody] = useState("")
  // Menções: ids coletados ao escolher um membro no autocomplete @.
  const [mentionIds, setMentionIds] = useState<string[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  // Filtro + paginação da atividade (evita o card crescer demais com histórico).
  const [filter, setFilter] = useState<"all" | "comment" | "history">("all")
  const PAGE = 8
  const [visible, setVisible] = useState(PAGE)

  // Membros que casam com o texto após "@".
  const mentionMatches =
    mentionQuery == null
      ? []
      : members
          .filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 6)

  const onBodyChange = (value: string) => {
    setBody(value)
    // Detecta token de menção logo antes do cursor: "@palavra".
    const m = value.match(/@([\p{L}\d ]{0,20})$/u)
    setMentionQuery(m ? m[1] : null)
  }

  const pickMention = (member: Member) => {
    // Substitui o "@query" pendente por "@Nome ".
    const next = body.replace(/@([\p{L}\d ]{0,20})$/u, `@${member.name} `)
    setBody(next)
    setMentionQuery(null)
    setMentionIds((ids) => (ids.includes(member.user_id) ? ids : [...ids, member.user_id]))
  }

  // Linha do tempo combinada: comentários + histórico, por data.
  type Item =
    | { kind: "comment"; at: string; data: NonNullable<typeof comments>[number] }
    | { kind: "history"; at: string; data: CardHistoryEntry }
  const timeline: Item[] = [
    ...(comments ?? []).map((c) => ({ kind: "comment" as const, at: c.created_at, data: c })),
    ...(history ?? []).map((h) => ({ kind: "history" as const, at: h.created_at, data: h })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  const nComments = comments?.length ?? 0
  const nHistory = history?.length ?? 0
  const filtered = timeline.filter((i) => filter === "all" || i.kind === filter)
  // Mostra as N mais recentes; "ver mais" expande para as antigas (paginação).
  const hidden = Math.max(0, filtered.length - visible)
  const displayed = hidden > 0 ? filtered.slice(-visible) : filtered

  const TABS: { id: typeof filter; label: string; count: number }[] = [
    { id: "all", label: "Tudo", count: timeline.length },
    { id: "comment", label: "Comentários", count: nComments },
    { id: "history", label: "Histórico", count: nHistory },
  ]

  const submit = async () => {
    const t = body.trim()
    if (!t) return
    // Só envia ids cujo nome ainda aparece no corpo final.
    const mentions = mentionIds.filter((id) => {
      const member = members.find((m) => m.user_id === id)
      return member ? t.includes(`@${member.name}`) : false
    })
    setBody("")
    setMentionIds([])
    setMentionQuery(null)
    await createComment.mutateAsync({ body: t, mentions })
  }

  return (
    <Section title="Atividade">
      <div className="space-y-3">
        {/* Caixa de novo comentário */}
        <div className="flex gap-2.5">
          <Avatar initials={initials(user?.full_name)} size="sm" />
            <div className="relative min-w-0 flex-1">
            <textarea
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              placeholder="Adicionar comentário…  (use @ para mencionar)"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Escape") setMentionQuery(null)
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit()
              }}
              className="w-full resize-y rounded-lg border border-paper-300 dark:border-ink-700 bg-paper dark:bg-ink-800 px-3 py-2 text-sm text-ink dark:text-paper outline-none focus:border-brand-400 placeholder-paper-400 dark:placeholder-paper-500"
            />
            {/* Autocomplete de menções */}
            {mentionMatches.length > 0 && (
              <ul className="absolute left-0 top-full z-20 mt-1 max-h-52 w-64 overflow-auto rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 py-1 shadow-pop">
                {mentionMatches.map((m) => (
                  <li key={m.user_id}>
                    <button
                      type="button"
                      onClick={() => pickMention(m)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm text-ink dark:text-paper hover:bg-paper-100 dark:hover:bg-ink-700"
                    >
                      <Avatar initials={initials(m.name)} size="sm" />
                      <span className="truncate">{m.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1.5 flex items-center gap-2">
              <Button size="sm" icon={<Send className="size-3.5" />} onClick={submit} loading={createComment.isPending} disabled={!body.trim()}>
                Comentar
              </Button>
              <span className="text-[11px] text-paper-400">⌘/Ctrl + Enter</span>
            </div>
            {/* Respostas sugeridas: só fazem sentido quando há conversa para
                responder, e some assim que a pessoa começa a escrever. */}
            {(comments?.length ?? 0) > 0 && !body.trim() && (
              <ReplySuggestions cardId={cardId} onPick={setBody} />
            )}
          </div>
        </div>

        {/* Filtro da atividade (Tudo / Comentários / Histórico) */}
        {!isLoading && timeline.length > 0 && (
          <div className="flex items-center gap-1 border-b border-paper-200 dark:border-ink-700 pb-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setFilter(t.id)
                  setVisible(PAGE)
                }}
                className={cx(
                  "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                  filter === t.id
                    ? "bg-brand-50 text-brand-700"
                    : "text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper",
                )}
              >
                {t.label}
                <span className="ml-1 text-[10px] text-paper-400">{t.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Linha do tempo (estilo Jira: ícone + tipo) */}
        {isLoading ? (
          <ul className="space-y-3" aria-hidden>
            {[0, 1].map((i) => (
              <li key={i} className="flex gap-2.5">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </li>
            ))}
          </ul>
        ) : timeline.length === 0 ? (
          <p className="flex items-center gap-2 py-3 text-sm text-paper-400">
            <MessageSquare className="size-4" /> Nenhuma atividade ainda.
          </p>
        ) : (
          <ul className="space-y-3">
            {hidden > 0 && (
              <li className="flex justify-center">
                <button
                  onClick={() => setVisible((v) => v + PAGE)}
                  className="rounded-full border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 px-3 py-1 text-[12px] font-medium text-paper-500 transition-colors hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper"
                >
                  Ver mais antigas ({hidden})
                </button>
              </li>
            )}
            {displayed.map((item) =>
              item.kind === "comment" ? (
                <li key={`c-${item.data.id}`} className="flex gap-2.5">
                  <Avatar initials={initials(item.data.author_name)} size="sm" />
                  <div className="min-w-0 flex-1 rounded-xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 px-3 py-2">
                    <div className="mb-0.5 flex items-center gap-2">
                      <Badge tone="outline" className="rounded-full px-2 py-0.5 text-[10px]">
                        Comentário
                      </Badge>
                      <span className="text-[13px] font-medium text-ink dark:text-paper">{item.data.author_name}</span>
                      <span className="text-[11px] text-paper-400">{fmtDateTime(item.data.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-ink dark:text-paper">
                      <MentionText text={item.data.body} members={members} />
                    </p>
                  </div>
                </li>
              ) : (
                <div key={`h-${item.data.id}`} className="flex gap-2.5">
                  <div className="pt-0.5">
                    <Avatar initials={initials(item.data.author_name)} size="sm" />
                  </div>
                  <div className="min-w-0 flex-1 rounded-xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 px-3 py-2">
                    <div className="mb-0.5 flex items-center gap-2">
                      <Badge tone="outline" className="rounded-full px-2 py-0.5 text-[10px]">
                        Alteração
                      </Badge>
                      <span className="text-[13px] font-medium text-ink dark:text-paper">{item.data.author_name || "Alguém"}</span>
                      <span className="text-[11px] text-paper-400">{fmtDateTime(item.data.created_at)}</span>
                    </div>
                    <div className="mt-2">
                      <HistoryLine h={item.data} />
                    </div>
                  </div>
                </div>
              ),
            )}
          </ul>
        )}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Auxiliares de UI
// ---------------------------------------------------------------------------
// Dropdown de status estilo Jira: lozenge atual + menu de transições coloridas.
const STATUS_ORDER: CardStatus[] = ["backlog", "todo", "doing", "review", "done"]

function StatusDropdown({
  value,
  onChange,
  variant = "outline",
}: {
  value: CardStatus
  onChange: (v: CardStatus) => void
  /** "solid" = botão azul cheio no topo da lateral (padrão Jira). */
  variant?: "outline" | "solid"
}) {
  const [open, setOpen] = useState(false)
  const solid = variant === "solid"
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Status: ${STATUS_LABEL[value]}`}
        className={cx(
          "inline-flex items-center gap-1.5 transition-colors focus-ring",
          solid
            ? "rounded bg-brand-500 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-brand-600"
            : "rounded border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-2 py-1 hover:border-paper-300 dark:hover:border-ink-600",
        )}
      >
        {solid ? STATUS_LABEL[value] : <StatusLozenge status={value} />}
        <ChevronDown className={cx("size-3.5", solid ? "text-white/80" : "text-paper-400")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul className="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 py-1 shadow-pop">
            {STATUS_ORDER.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    if (s !== value) onChange(s)
                  }}
                  className={cx(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-paper-100 dark:hover:bg-ink-700",
                    s === value && "bg-paper-50 dark:bg-ink-800",
                  )}
                >
                  <StatusLozenge status={s} />
                  {s === value && <Check className="ml-auto size-3.5 text-brand-500" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// Realça @menções de membros conhecidos no corpo do comentário.
function MentionText({ text, members }: { text: string; members: Member[] }) {
  if (members.length === 0) return <>{text}</>
  const names = [...members].sort((a, b) => b.name.length - a.name.length)
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(`@(${names.map((m) => esc(m.name)).join("|")})`, "g")
  const parts = text.split(re)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded bg-brand-50 px-1 font-medium text-brand-700">
            @{part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

// Conteúdo que abre/fecha com chevron — usado pelas seções da coluna principal
// e pelos painéis da lateral. Respeita prefers-reduced-motion.
function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="body"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={
            reduce
              ? { duration: 0 }
              : { height: { duration: 0.18, ease: [0.2, 0, 0, 1] }, opacity: { duration: 0.12 } }
          }
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Chevron que gira 90° ao abrir (150ms) — transform puro, sem reflow.
function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      aria-hidden
      className={cx(
        "size-3.5 shrink-0 text-paper-400 transition-transform duration-150 motion-reduce:transition-none",
        open && "rotate-90",
      )}
    />
  )
}

// Seção colapsável da coluna principal (Descrição, Subtarefas, Atividade…).
function Section({
  title,
  children,
  action,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="-ml-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-base font-semibold text-ink dark:text-ink-200 transition-colors hover:bg-paper-100 dark:hover:bg-ink-800 focus-ring"
        >
          <Chevron open={open} />
          {title}
        </button>
        {action && <div className="ml-auto flex items-center gap-1">{action}</div>}
      </div>
      <Collapse open={open}>{children}</Collapse>
    </div>
  )
}

// Painel com borda da coluna lateral (Informações, Desenvolvimento…).
function SidePanel({
  title,
  children,
  action,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    // No dark o painel é a mesma cor do modal: quem o desenha é a borda de
    // 1px translúcida (`--ds-border`), não uma superfície mais clara.
    <section className="rounded-lg border border-paper-200 bg-white dark:border-ink-700 dark:bg-transparent">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-1.5 rounded text-left text-base font-semibold text-ink dark:text-ink-200 focus-ring"
        >
          <Chevron open={open} />
          {title}
        </button>
        {action}
      </div>
      <Collapse open={open}>
        <div className="px-3 pb-3">{children}</div>
      </Collapse>
    </section>
  )
}

// "há 3 dias", "há 1 hora" — para o rodapé de criado/atualizado.
function timeAgo(iso: string | null): string | null {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff)) return null
  const min = Math.floor(diff / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} ${min === 1 ? "minuto" : "minutos"}`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} ${h === 1 ? "hora" : "horas"}`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d} ${d === 1 ? "dia" : "dias"}`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `há ${mo} ${mo === 1 ? "mês" : "meses"}`
  const y = Math.floor(mo / 12)
  return `há ${y} ${y === 1 ? "ano" : "anos"}`
}

function EpicBadge({ projectId, epicId }: { projectId: string; epicId: string }) {
  const { data: epics } = useEpics(projectId)
  const epic = (epics ?? []).find((e) => e.id === epicId)
  if (!epic) return null
  return (
    <span
      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
      style={{ backgroundColor: epic.color }}
      title={epic.title}
    >
      {epic.ref}
    </span>
  )
}

function EpicSelect({
  projectId,
  value,
  onChange,
}: {
  projectId: string
  value: string | null
  onChange: (v: string | null) => void
}) {
  const { data: epics } = useEpics(projectId)
  const selected = (epics ?? []).find((e) => e.id === value)

  return (
    <DetailRow label="Epic">
      <div className="group relative">
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className={cx(FIELD_INLINE, "h-8 pr-6")}
        >
          <option value="">Sem épico</option>
          {(epics ?? []).map((e) => (
            <option key={e.id} value={e.id}>{e.ref} · {e.title}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-paper-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" />
      </div>
      {selected && (
        <span
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: selected.color }}
        >
          {selected.ref}
        </span>
      )}
    </DetailRow>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] items-start gap-2 py-1">
      <span className="pt-1.5 text-sm font-medium leading-tight text-paper-500 dark:text-ink-300">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

// Ícone-ação do cabeçalho do drawer (copiar link, expandir, fechar).
function DeleteCardModal({
  card,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  card: Card
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const [confirmText, setConfirmText] = useState("")
  const canConfirm = confirmText.trim().toLowerCase() === "deletar"

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
        onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-paper-200 bg-white p-5 shadow-xl dark:border-ink-700 dark:bg-ink-800">
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink dark:text-paper">
          <Trash2 className="size-4 text-danger-500" />
          Deletar {card.ref}?
        </h3>
        <p className="mt-2 text-sm text-paper-500">
          Essa ação é definitiva e não pode ser desfeita. Pra confirmar,
          digite <span className="font-semibold text-ink dark:text-paper">deletar</span>.
        </p>
        <input
          autoFocus
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="deletar"
          className="mt-3 w-full rounded-lg border border-paper-300 bg-paper px-3 py-2 text-sm outline-none focus:border-danger-400 dark:border-ink-700 dark:bg-ink-900"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={onConfirm}
            disabled={!canConfirm || isDeleting}
            loading={isDeleting}
          >
            Deletar card
          </Button>
        </div>
      </div>
    </div>
  )
}

function ToolbarButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        "grid size-8 place-items-center rounded-lg text-paper-400 transition-colors hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper focus-ring",
        className,
      )}
    >
      {children}
    </button>
  )
}

// Campo do painel lateral no padrão do Jira: o valor é texto plano, sem caixa.
// A borda de 2px é transparente em repouso e só aparece no hover/foco — é ela
// que faz o campo parecer "somente leitura até você tocar", em vez de um
// formulário permanente de selects. Medidas lidas do Jira: altura 32px,
// padding 0 6px, raio 6px.
const FIELD_INLINE =
  "w-full cursor-pointer appearance-none rounded-md border-2 border-transparent bg-transparent px-1.5 text-sm text-ink outline-none transition-colors " +
  "hover:bg-paper-100 focus:border-brand-500 focus:bg-white " +
  "dark:text-ink-200 dark:hover:bg-ink-800 dark:focus:border-brand-300 dark:focus:bg-ink-800"

function DetailSelect({
  label,
  value,
  onChange,
  options,
  renderValue,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  renderValue?: React.ReactNode
}) {
  return (
    <DetailRow label={label}>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cx(FIELD_INLINE, "h-8", renderValue ? "pl-7" : "")}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="text-ink dark:text-paper">
              {o.label}
            </option>
          ))}
        </select>
        {renderValue && (
          <div className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center">{renderValue}</div>
        )}
      </div>
    </DetailRow>
  )
}

function PersonSelect({
  value,
  members,
  person,
  onChange,
}: {
  value: string | null
  members: Member[]
  person?: Member
  onChange: (v: string | null) => void
}) {
  return (
    <div className="relative flex items-center gap-2">
      {person ? (
        <span
          className={cx(
            "grid size-6 place-items-center rounded-full bg-gradient-to-br font-semibold text-white text-[9px] ring-1 ring-inset ring-white/20 shrink-0",
            avatarGradient(person.name),
          )}
        >
          {initials(person.name)}
        </span>
      ) : (
        <span className="grid size-6 place-items-center rounded-full border border-dashed border-paper-300 text-[9px] text-paper-400 shrink-0">
          ?
        </span>
      )}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={cx(FIELD_INLINE, "h-8")}
      >
        <option value="">Ninguém</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function DateInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const selected = value ? new Date(value + "T12:00:00") : null

  return (
    <div className="relative flex items-center group date-input-wrapper">
      <Calendar className="pointer-events-none absolute left-1.5 z-10 size-3.5 text-paper-400 transition-colors group-hover:text-paper-500 group-focus-within:text-brand-400" />
      <DatePicker
        selected={selected}
        onChange={(date: Date | null) => onChange(date ? date.toISOString().slice(0, 10) : null)}
        locale="pt-BR"
        dateFormat="dd/MM/yyyy"
        placeholderText="dd/mm/aaaa"
        popperPlacement="bottom-start"
        withPortal={false}
        className={cx(FIELD_INLINE, "h-8 pl-7")}
        isClearable
        clearButtonTitle="Limpar"
        wrapperClassName="w-full"
      />
    </div>
  )
}

function initials(name?: string) {
  if (!name) return "?"
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}
