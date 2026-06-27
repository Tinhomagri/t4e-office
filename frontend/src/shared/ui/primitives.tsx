// Design system do Pulse ("Graphite Premium"). Base monocromática refinada com
// acento da marca (brand) em estados ativos/foco. Componentes reusados em todas
// as telas — sempre via tokens, nunca hex solto.
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react"
import { Loader2, X } from "lucide-react"

import type { CardType, Priority } from "@/features/today/today.mock"
import type { PresenceStatus } from "@/features/workspace/workspace.mock"

// Pequeno helper para concatenar classes condicionais sem dependência externa.
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}

// ---------------------------------------------------------------------------
// Botão — variantes primary (brand), solid (ink), outline, ghost, danger
// ---------------------------------------------------------------------------
type ButtonVariant = "primary" | "solid" | "outline" | "ghost" | "danger"
type ButtonSize = "sm" | "md" | "lg"

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-ring"

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-500 text-white shadow-brand-glow hover:bg-brand-600",
  solid: "bg-ink text-paper hover:bg-ink-700",
  outline: "border border-paper-300 bg-paper text-ink hover:bg-paper-100",
  ghost: "text-paper-600 hover:bg-paper-100 hover:text-ink",
  danger: "bg-danger text-white hover:brightness-95",
}

const BTN_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

// Botão só-ícone (topbar, toolbars)
export function IconButton({
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx(
        "grid size-9 place-items-center rounded-xl text-paper-500 transition-colors hover:bg-paper-100 hover:text-ink focus-ring",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Badge — tom neutro/brand/semântico
// ---------------------------------------------------------------------------
type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "outline"

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-paper-100 text-paper-600",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  outline: "border border-paper-300 text-paper-600",
}

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium",
        BADGE_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

// Atalho de teclado (⌘K) — para a busca/command palette
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-paper-300 bg-paper px-1.5 py-0.5 font-sans text-[10px] font-medium text-paper-500 shadow-xs">
      {children}
    </kbd>
  )
}

// Rótulo de seção (uppercase, tracking) — usado em sidebars e painéis
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-paper-400">
      {children}
    </p>
  )
}

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={cx("animate-spin text-paper-400", className)} />
}

// ---------------------------------------------------------------------------
// Modal — overlay com blur + painel centralizado (scale-in)
// ---------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "md",
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  footer?: ReactNode
  children: ReactNode
  size?: "md" | "lg"
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-ink-950/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cx(
          "relative z-10 max-h-[90vh] w-full animate-scale-in overflow-hidden rounded-2xl border border-paper-200 bg-paper shadow-pop",
          size === "lg" ? "max-w-2xl" : "max-w-md",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-paper-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-paper-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-1 grid size-8 place-items-center rounded-lg text-paper-400 transition-colors hover:bg-paper-100 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 scrollbar-slim">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-paper-200 bg-paper-50 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Controles de formulário
// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-paper-500">{hint}</span>}
    </label>
  )
}

const CONTROL =
  "w-full rounded-xl border border-paper-300 bg-paper px-3 py-2 text-sm text-ink placeholder-paper-400 transition-colors focus-ring focus:border-brand-400"

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, className)} {...rest} />
}

export function Textarea({
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, "resize-y", className)} {...rest} />
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(CONTROL, "cursor-pointer pr-8", className)} {...rest}>
      {children}
    </select>
  )
}

const TYPE_LABEL: Record<CardType, string> = {
  feature: "Feature",
  bug: "Bug",
  spike: "Spike",
  debt: "Débito",
}

export function ShortId({ id }: { id: string }) {
  return <span className="font-mono text-xs font-medium text-paper-500">{id}</span>
}

export function TypeTag({ type }: { type: CardType }) {
  return (
    <span className="rounded border border-ink/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-paper-500">
      {TYPE_LABEL[type]}
    </span>
  )
}

// Prioridade: barra cheia / meia / vazia (sem depender de cor)
export function PriorityMark({ priority }: { priority: Priority }) {
  const fill =
    priority === "high" ? "bg-ink" : priority === "medium" ? "bg-paper-400" : "bg-paper-300"
  return <span className={`h-8 w-1 shrink-0 rounded-full ${fill}`} title={`Prioridade ${priority}`} />
}

const PRESENCE_DOT: Record<PresenceStatus, string> = {
  available: "bg-emerald-500",
  focus: "bg-rose-500",
  meeting: "bg-amber-500",
  away: "bg-paper-400",
}

export const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  available: "Disponível",
  focus: "Em foco",
  meeting: "Em reunião",
  away: "Ausente",
}

export function StatusDot({ status, className = "" }: { status: PresenceStatus; className?: string }) {
  return <span className={`size-2 rounded-full ${PRESENCE_DOT[status]} ${className}`} title={PRESENCE_LABEL[status]} />
}

export function Avatar({
  initials,
  status,
  size = "md",
}: {
  initials: string
  status?: PresenceStatus
  size?: "xs" | "sm" | "md" | "lg"
}) {
  const dim =
    size === "xs"
      ? "size-6 text-[9px]"
      : size === "sm"
        ? "size-7 text-[10px]"
        : size === "lg"
          ? "size-11 text-sm"
          : "size-9 text-xs"
  const dot =
    size === "lg" ? "size-3" : size === "xs" ? "size-2" : "size-2.5"
  return (
    <span className="relative inline-grid shrink-0 place-items-center">
      <span
        className={cx(
          "grid place-items-center rounded-full bg-gradient-to-br from-ink-600 to-ink-900 font-semibold text-paper ring-1 ring-inset ring-white/10",
          dim,
        )}
      >
        {initials}
      </span>
      {status && (
        <span
          className={cx(
            "absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-paper",
            dot,
            PRESENCE_DOT[status],
          )}
        />
      )}
    </span>
  )
}

// Cabeçalho de página padrão — eyebrow opcional, título e área de ações
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  children,
}: {
  title: string
  subtitle?: string
  eyebrow?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-paper-500">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-paper-500">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

// Selo "em breve" para superfícies ainda não ligadas à API
export function SoonBadge() {
  return (
    <span className="rounded-full border border-ink/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-paper-400">
      em breve
    </span>
  )
}
