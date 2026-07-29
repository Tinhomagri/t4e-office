// Leads & prospecção: entrada do funil — captar, qualificar e converter.
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertTriangle,
  ArrowRightCircle,
  Check,
  Clock,
  Import,
  Plus,
  Search,
  ThumbsDown,
  UserSearch,
  X,
} from "lucide-react"
import { useMemo, useState } from "react"

import { fadeUpItem, staggerContainer } from "@/shared/lib/motion"
import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Spinner,
  Textarea,
  cx,
} from "@/shared/ui/primitives"
import { useMembers } from "@/features/workspace/workspace.hooks"

import {
  useConvertLead,
  useCreateLead,
  useDisqualifyLead,
  useImportLeadsCsv,
  useLeads,
  useMarkLeadContacted,
  useQualifyLead,
} from "../leads.hooks"
import type { ConvertLeadInput, CreateLeadInput, Lead, LeadStatus } from "../leads.types"

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Novo",
  contacted: "Contatado",
  qualifying: "Qualificando",
  qualified: "Qualificado",
  disqualified: "Desqualificado",
  converted: "Convertido",
}

const STATUS_COLOR: Record<LeadStatus, string> = {
  new: "bg-paper-100 text-paper-600 dark:bg-ink-800 dark:text-paper-400",
  contacted: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  qualifying: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  qualified: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  disqualified: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  converted: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
}

type TabKey = "fila" | "qualified" | "disqualified" | "converted"

const TABS: { key: TabKey; label: string }[] = [
  { key: "fila", label: "Fila" },
  { key: "qualified", label: "Qualificados" },
  { key: "disqualified", label: "Desqualificados" },
  { key: "converted", label: "Convertidos" },
]

export function LeadsView({ workspaceId }: { workspaceId: string | null }) {
  const [tab, setTab] = useState<TabKey>("fila")
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<Lead | null>(null)

  const { data: leads, isLoading } = useLeads(workspaceId, { search })
  const { data: members } = useMembers(workspaceId)

  const filtered = useMemo(() => {
    const list = leads ?? []
    switch (tab) {
      case "qualified":
        return list.filter((l) => l.status === "qualified")
      case "disqualified":
        return list.filter((l) => l.status === "disqualified")
      case "converted":
        return list.filter((l) => l.status === "converted")
      default:
        return list.filter((l) => l.is_open && l.status !== "qualified")
    }
  }, [leads, tab])

  const overdueCount = (leads ?? []).filter((l) => l.is_overdue).length
  const current = selected ? ((leads ?? []).find((l) => l.id === selected.id) ?? selected) : null

  return (
    <div className="flex flex-col gap-4">
      {/* Header: busca + ações */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-paper-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, empresa ou e-mail…"
            aria-label="Buscar leads"
            className="min-h-11 pl-9"
          />
        </div>
        <Button variant="ghost" icon={<Import className="size-4" />} onClick={() => setImporting(true)} className="min-h-11">
          Importar CSV
        </Button>
        <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)} className="min-h-11">
          Novo lead
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.key
                ? "bg-ink text-paper shadow-sm"
                : "border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 text-paper-600 hover:bg-paper-100 dark:hover:bg-ink-800",
            )}
          >
            {t.label}
          </button>
        ))}
        {overdueCount > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:text-red-300">
            <AlertTriangle className="size-3" /> {overdueCount} com SLA vencido
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-20">
          <Spinner className="size-6" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<UserSearch className="size-6" />}
          title="Nenhum lead nesta fila"
          description="Capte um lead manualmente ou importe uma lista via CSV para começar a prospecção."
          action={
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Novo lead
            </Button>
          }
        />
      ) : (
        <motion.ul variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-2">
          {filtered.map((lead) => (
            <motion.li key={lead.id} variants={fadeUpItem}>
              <LeadRow lead={lead} members={members ?? []} onOpen={() => setSelected(lead)} />
            </motion.li>
          ))}
        </motion.ul>
      )}

      {creating && <CreateLeadModal workspaceId={workspaceId} onClose={() => setCreating(false)} />}
      {importing && <ImportLeadsModal workspaceId={workspaceId} onClose={() => setImporting(false)} />}

      <AnimatePresence>
        {current && (
          <LeadDrawer
            key={current.id}
            lead={current}
            workspaceId={workspaceId}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function LeadRow({
  lead,
  members,
  onOpen,
}: {
  lead: Lead
  members: { user_id: string; name: string }[]
  onOpen: () => void
}) {
  const owner = members.find((m) => m.user_id === lead.owner_id)
  return (
    <button
      onClick={onOpen}
      className={cx(
        "flex w-full items-center gap-3 rounded-2xl border border-paper-200 bg-paper px-4 py-3 text-left dark:border-ink-700 dark:bg-ink-900",
        "transition-[transform,box-shadow,border-color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-0.5 hover:border-paper-300 hover:shadow-panel focus-ring",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper-100 text-paper-500 dark:bg-ink-800">
        <UserSearch className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink dark:text-paper">{lead.name}</span>
          {lead.company && <span className="truncate text-xs text-paper-500">· {lead.company}</span>}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-paper-500">
          {lead.email && <span className="truncate">{lead.email}</span>}
          {lead.source && <span className="truncate">Origem: {lead.source}</span>}
          {owner && <span className="truncate">Dono: {owner.name}</span>}
        </span>
      </span>
      {lead.is_overdue && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-100 dark:bg-red-500/15 px-2 py-1 text-[10px] font-semibold text-red-700 dark:text-red-300">
          <Clock className="size-3" /> SLA vencido
        </span>
      )}
      {lead.score > 0 && (
        <span className="shrink-0 text-xs font-semibold tabular text-paper-500">{lead.score}pts</span>
      )}
      <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium", STATUS_COLOR[lead.status])}>
        {STATUS_LABEL[lead.status]}
      </span>
    </button>
  )
}

function CreateLeadModal({ workspaceId, onClose }: { workspaceId: string | null; onClose: () => void }) {
  const createLead = useCreateLead(workspaceId)
  const [form, setForm] = useState<CreateLeadInput>({ name: "", company: "", email: "", phone: "", source: "" })
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!form.name.trim()) {
      setError("Informe o nome do lead.")
      return
    }
    try {
      await createLead.mutateAsync(form)
      onClose()
    } catch {
      setError("Não foi possível captar o lead.")
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Novo lead"
      description="Captação manual — origem padrão fica marcada como manual."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} loading={createLead.isPending}>Captar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nome">
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
        </Field>
        <Field label="Empresa" hint="Opcional">
          <Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
        </Field>
        <Field label="E-mail" hint="Opcional">
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </Field>
        <Field label="Telefone" hint="Opcional">
          <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </Field>
        <Field label="Origem" hint="Ex.: site, indicação, evento">
          <Input value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}

function ImportLeadsModal({ workspaceId, onClose }: { workspaceId: string | null; onClose: () => void }) {
  const importCsv = useImportLeadsCsv(workspaceId)
  const [csvText, setCsvText] = useState("name,company,email,phone,source\n")
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!csvText.trim()) {
      setError("Cole o conteúdo do CSV.")
      return
    }
    try {
      await importCsv.mutateAsync(csvText)
      onClose()
    } catch {
      setError("Não foi possível importar o CSV.")
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Importar leads via CSV"
      description="Colunas aceitas: name, company, email, phone, source. Linhas sem nome viram erro sem derrubar as outras."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} loading={importCsv.isPending}>Importar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Conteúdo do CSV">
          <Textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={10}
            className="font-mono text-xs"
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}

function LeadDrawer({
  lead,
  workspaceId,
  onClose,
}: {
  lead: Lead
  workspaceId: string | null
  onClose: () => void
}) {
  const markContacted = useMarkLeadContacted(workspaceId)
  const qualify = useQualifyLead(workspaceId)
  const disqualify = useDisqualifyLead(workspaceId)
  const convert = useConvertLead(workspaceId)

  const [scoreModal, setScoreModal] = useState(false)
  const [disqualifyModal, setDisqualifyModal] = useState(false)
  const [convertModal, setConvertModal] = useState(false)

  const canAct = lead.is_open

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex justify-end bg-ink/30"
      onClick={onClose}
    >
      <motion.aside
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-ink dark:text-paper">{lead.name}</h2>
            {lead.company && <p className="text-sm text-paper-500">{lead.company}</p>}
          </div>
          <button onClick={onClose} className="text-paper-400 hover:text-ink dark:hover:text-paper">
            <X className="size-5" />
          </button>
        </div>

        <span className={cx("mb-4 inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-medium", STATUS_COLOR[lead.status])}>
          {STATUS_LABEL[lead.status]}
        </span>

        <dl className="mb-5 space-y-2 text-sm">
          {lead.email && (
            <div className="flex justify-between gap-3">
              <dt className="text-paper-500">E-mail</dt>
              <dd className="truncate text-ink dark:text-paper">{lead.email}</dd>
            </div>
          )}
          {lead.phone && (
            <div className="flex justify-between gap-3">
              <dt className="text-paper-500">Telefone</dt>
              <dd className="text-ink dark:text-paper">{lead.phone}</dd>
            </div>
          )}
          {lead.source && (
            <div className="flex justify-between gap-3">
              <dt className="text-paper-500">Origem</dt>
              <dd className="text-ink dark:text-paper">{lead.source}</dd>
            </div>
          )}
          {lead.score > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-paper-500">Score</dt>
              <dd className="font-semibold text-ink dark:text-paper">{lead.score}/100</dd>
            </div>
          )}
          {lead.first_contact_due_at && !lead.contacted_at && (
            <div className="flex justify-between gap-3">
              <dt className="text-paper-500">Prazo de 1º contato</dt>
              <dd className={cx("font-medium", lead.is_overdue ? "text-danger" : "text-ink dark:text-paper")}>
                {new Date(lead.first_contact_due_at).toLocaleString("pt-BR")}
              </dd>
            </div>
          )}
          {lead.status === "disqualified" && lead.disqualify_reason && (
            <div className="flex justify-between gap-3">
              <dt className="text-paper-500">Motivo do descarte</dt>
              <dd className="text-ink dark:text-paper">{lead.disqualify_reason}</dd>
            </div>
          )}
        </dl>

        {canAct && (
          <div className="flex flex-col gap-2">
            {!lead.contacted_at && (
              <Button
                variant="ghost"
                icon={<Check className="size-4" />}
                loading={markContacted.isPending}
                onClick={() => markContacted.mutate(lead.id)}
              >
                Marcar 1º contato
              </Button>
            )}
            {lead.status !== "qualified" && (
              <Button variant="ghost" icon={<Check className="size-4" />} onClick={() => setScoreModal(true)}>
                Qualificar
              </Button>
            )}
            <Button
              variant="ghost"
              icon={<ThumbsDown className="size-4" />}
              onClick={() => setDisqualifyModal(true)}
            >
              Desqualificar
            </Button>
            <Button icon={<ArrowRightCircle className="size-4" />} onClick={() => setConvertModal(true)}>
              Converter em negócio
            </Button>
          </div>
        )}

        {scoreModal && (
          <QualifyModal
            lead={lead}
            onClose={() => setScoreModal(false)}
            onSubmit={async (score) => {
              await qualify.mutateAsync({ id: lead.id, score })
              setScoreModal(false)
            }}
            loading={qualify.isPending}
          />
        )}
        {disqualifyModal && (
          <DisqualifyModal
            onClose={() => setDisqualifyModal(false)}
            onSubmit={async (reason) => {
              await disqualify.mutateAsync({ id: lead.id, reason })
              setDisqualifyModal(false)
              onClose()
            }}
            loading={disqualify.isPending}
          />
        )}
        {convertModal && (
          <ConvertModal
            lead={lead}
            onClose={() => setConvertModal(false)}
            onSubmit={async (input) => {
              await convert.mutateAsync({ id: lead.id, input })
              setConvertModal(false)
              onClose()
            }}
            loading={convert.isPending}
          />
        )}
      </motion.aside>
    </motion.div>
  )
}

function QualifyModal({
  lead,
  onClose,
  onSubmit,
  loading,
}: {
  lead: Lead
  onClose: () => void
  onSubmit: (score: number) => Promise<void>
  loading: boolean
}) {
  const [score, setScore] = useState(lead.score || 50)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    try {
      await onSubmit(score)
    } catch {
      setError("Não foi possível qualificar o lead.")
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Qualificar lead"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} loading={loading}>Qualificar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Score (0–100)">
          <Input
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}

function DisqualifyModal({
  onClose,
  onSubmit,
  loading,
}: {
  onClose: () => void
  onSubmit: (reason: string) => Promise<void>
  loading: boolean
}) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!reason.trim()) {
      setError("Informe o motivo do descarte.")
      return
    }
    try {
      await onSubmit(reason.trim())
    } catch {
      setError("Não foi possível desqualificar o lead.")
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Desqualificar lead"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} loading={loading}>Desqualificar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Motivo">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}

function ConvertModal({
  lead,
  onClose,
  onSubmit,
  loading,
}: {
  lead: Lead
  onClose: () => void
  onSubmit: (input: ConvertLeadInput) => Promise<void>
  loading: boolean
}) {
  const [dealTitle, setDealTitle] = useState(lead.company || lead.name)
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    try {
      await onSubmit({ deal_title: dealTitle.trim(), amount: amount.trim() })
    } catch {
      setError("Não foi possível converter o lead.")
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Converter em cliente + negócio"
      description="Sem redigitar dados: nome, empresa e contato do lead viram o cliente."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} loading={loading}>Converter</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Título do negócio">
          <Input value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Valor" hint="Opcional">
          <Input
            type="number"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
