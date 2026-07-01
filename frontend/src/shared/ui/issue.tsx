// Componentes reutilizáveis de issue no padrão Jira/Atlassian:
// ícone de tipo (colorido por categoria), ícone de prioridade direcional e
// "lozenge" de status com as cores corretas. Tipados nos unions reais do
// domínio para serem drop-in em board, drawer, lista e relatórios.
import {
  Bookmark,
  Bug,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  CreditCard,
  Equal,
  FlaskConical,
  CheckSquare,
  Zap,
  type LucideIcon,
} from "lucide-react"

import type {
  CardPriority,
  CardStatus,
  CardType,
} from "@/features/workspace/workspace.types"
import { cn } from "@/shared/lib/cn"

// ── Tipo de issue ────────────────────────────────────────────────────────────
const TYPE_META: Record<CardType, { icon: LucideIcon; className: string; label: string }> = {
  feature: { icon: Bookmark, className: "bg-blue-500 text-white", label: "Feature" },
  bug: { icon: Bug, className: "bg-red-500 text-white", label: "Bug" },
  epic: { icon: Zap, className: "bg-violet-600 text-white", label: "Epic" },
  chore: { icon: CheckSquare, className: "bg-blue-500 text-white", label: "Tarefa" },
  spike: { icon: FlaskConical, className: "bg-cyan-600 text-white", label: "Spike" },
  debt: { icon: CreditCard, className: "bg-orange-500 text-white", label: "Débito" },
}

export function IssueTypeIcon({
  type,
  className,
}: {
  type: CardType
  className?: string
}) {
  const meta = TYPE_META[type]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        "inline-grid size-4 shrink-0 place-items-center rounded",
        meta.className,
        className,
      )}
      title={meta.label}
      aria-label={meta.label}
    >
      <Icon className="size-3" strokeWidth={2.5} />
    </span>
  )
}

// ── Prioridade (ícone direcional) ────────────────────────────────────────────
const PRIORITY_META: Record<
  CardPriority,
  { icon: LucideIcon; className: string; label: string }
> = {
  urgent: { icon: ChevronsUp, className: "text-red-500", label: "Urgente" },
  high: { icon: ChevronUp, className: "text-orange-500", label: "Alta" },
  medium: { icon: Equal, className: "text-yellow-500", label: "Média" },
  low: { icon: ChevronDown, className: "text-green-500", label: "Baixa" },
}

export function PriorityIcon({
  priority,
  className,
}: {
  priority: CardPriority
  className?: string
}) {
  const meta = PRIORITY_META[priority]
  const Icon = meta.icon
  return (
    <Icon
      className={cn("size-3.5 shrink-0", meta.className, className)}
      strokeWidth={3}
      aria-label={`Prioridade ${meta.label}`}
    />
  )
}

// fallback p/ quando houver prioridade "lowest" futura — mantém o import vivo
export const LowestPriorityIcon = ChevronsDown

// ── Status (lozenge Atlassian) ───────────────────────────────────────────────
const STATUS_META: Record<CardStatus, { className: string; label: string }> = {
  backlog: { className: "bg-neutral-200 text-neutral-700", label: "Backlog" },
  todo: { className: "bg-neutral-200 text-neutral-700", label: "A fazer" },
  doing: { className: "bg-blue-100 text-blue-700", label: "Em andamento" },
  review: { className: "bg-orange-100 text-orange-700", label: "Em revisão" },
  done: { className: "bg-green-100 text-green-700", label: "Concluído" },
}

export function StatusLozenge({
  status,
  className,
}: {
  status: CardStatus
  className?: string
}) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  )
}
