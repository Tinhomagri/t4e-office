// Design system do Pulse ("Graphite Premium"). Base monocromática refinada com
// acento da marca (brand) em estados ativos/foco. Componentes reusados em todas
// as telas — sempre via tokens, nunca hex solto.
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react"
import { Children, isValidElement, useEffect, useRef, useState } from "react"
import { ChevronDown, Loader2, X } from "lucide-react"

import type { PresenceStatus } from "@/features/workspace/workspace.types"

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
  outline: "border border-paper-300 bg-paper dark:bg-ink-900 text-ink dark:text-paper hover:bg-paper-100 dark:hover:bg-ink-800",
  ghost: "text-paper-600 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper",
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
        "grid size-9 place-items-center rounded-xl text-paper-500 transition-colors hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper focus-ring",
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
  neutral: "bg-paper-100 dark:bg-ink-800 text-paper-600",
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
    <kbd className="rounded-md border border-paper-300 bg-paper dark:bg-ink-900 px-1.5 py-0.5 font-sans text-[10px] font-medium text-paper-500 shadow-xs">
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

// Estado vazio com CTA — usado quando uma lista/visão não tem itens.
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-paper-300 dark:border-ink-700 bg-paper-50/60 dark:bg-ink-900/40 px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 grid size-12 place-items-center rounded-full bg-paper-100 dark:bg-ink-800 text-paper-400">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-ink dark:text-paper">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-paper-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// Bloco de carregamento (shimmer) — placeholder de conteúdo enquanto carrega.
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={cx(
        "animate-pulse rounded-md bg-paper-200/70 dark:bg-ink-700/70",
        className,
      )}
    />
  )
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
  size?: "md" | "lg" | "xl"
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
          "relative z-10 max-h-[90vh] w-full animate-scale-in overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 shadow-pop",
          size === "xl" ? "max-w-4xl" : size === "lg" ? "max-w-2xl" : "max-w-md",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-paper-200 dark:border-ink-700 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink dark:text-paper">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-paper-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-1 grid size-8 place-items-center rounded-lg text-paper-400 transition-colors hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 scrollbar-slim">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-900 px-5 py-3">
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
      <span className="mb-1.5 block text-[13px] font-medium text-ink dark:text-paper">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-paper-500">{hint}</span>}
    </label>
  )
}

const CONTROL =
  "w-full rounded-xl border border-paper-300 dark:border-ink-700 bg-paper dark:bg-ink-900 px-3 py-2 text-sm text-ink dark:text-paper placeholder-paper-400 transition-colors focus-ring focus:border-brand-400"

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, className)} {...rest} />
}

export function Textarea({
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, "resize-y", className)} {...rest} />
}

// Select customizado: a lista aberta de um <select> nativo é pintada pelo SO
// (Windows/GTK/macOS), nunca segue o CSS da página — por isso o menu abria
// sempre claro/feio mesmo com o tema escuro certo na caixa fechada. Mantém
// um <select> nativo oculto só pra emitir o evento `change` real (mesma API
// de sempre: value/onChange/<option>), e desenha o botão + lista abertos do
// zero, temados.
export function Select({
  className = "",
  children,
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onDocPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const options = Children.toArray(children).filter(isValidElement) as ReactElement<{
    value?: string | number
    children?: ReactNode
  }>[]
  const current = options.find((o) => String(o.props.value ?? "") === String(value ?? ""))

  function pick(v: string) {
    const el = selectRef.current
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")!.set!
      setter.call(el, v)
      el.dispatchEvent(new Event("change", { bubbles: true }))
    }
    setOpen(false)
  }

  return (
    <span ref={wrapperRef} className={cx("relative block", className || "w-full")}>
      <select ref={selectRef} value={value} onChange={onChange} className="sr-only" tabIndex={-1} aria-hidden {...rest}>
        {children}
      </select>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          CONTROL,
          "flex h-full w-full cursor-pointer items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <span className="truncate">{current?.props.children}</span>
        <ChevronDown className={cx("size-3.5 shrink-0 text-paper-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="absolute z-50 mt-1.5 max-h-64 w-full min-w-max overflow-auto rounded-xl border border-paper-200 bg-paper py-1 shadow-panel dark:border-ink-700 dark:bg-ink-900">
          {options.map((o, i) => {
            const v = String(o.props.value ?? "")
            const active = v === String(value ?? "")
            return (
              <li key={v || i}>
                <button
                  type="button"
                  onClick={() => pick(v)}
                  className={cx(
                    "flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-paper-100 dark:hover:bg-ink-800",
                    active ? "font-medium text-brand-600 dark:text-brand-400" : "text-ink dark:text-paper",
                  )}
                >
                  {o.props.children}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </span>
  )
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
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink dark:text-paper">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-paper-500">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

