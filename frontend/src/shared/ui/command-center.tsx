// Casca do "command center": os blocos que dão a densidade e as ferramentas de
// leitura das telas operacionais (marketing e comercial). Tudo em cima dos
// tokens Atlassian já existentes — nada de hex solto, nada de dependência nova.
//
// Doutrina de movimento (desktop): motion curto e funcional. Opacidade e
// translate pequenos abaixo de 200ms, spring só onde há continuidade espacial
// (indicador de aba). Nada disso pisca quando o usuário pediu menos movimento.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Search, X } from "lucide-react"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { EASE, springSnappy } from "@/shared/lib/motion"
import { Kbd, cx } from "@/shared/ui/primitives"

// ---------------------------------------------------------------------------
// Hooks utilitários
// ---------------------------------------------------------------------------

/** Estado persistido em localStorage — filtros e preferências sobrevivem ao F5. */
export function usePersistedState<T>(key: string, initial: T) {
  const storageKey = `pulse:${key}`
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial
    try {
      const raw = window.localStorage.getItem(storageKey)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // Modo privado / quota cheia: preferência vira efêmera, não quebra a tela.
    }
  }, [storageKey, value])

  return [value, setValue] as const
}

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)

export const MOD_LABEL = IS_MAC ? "⌘" : "Ctrl"

/**
 * Atalho global. `combo` no formato "mod+k" / "mod+shift+f" / "escape".
 * Ignora digitação em campos de texto, salvo quando `allowInInput`.
 */
export function useHotkey(
  combo: string,
  handler: () => void,
  { allowInInput = false, enabled = true }: { allowInInput?: boolean; enabled?: boolean } = {},
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) return
    const parts = combo.toLowerCase().split("+")
    const key = parts[parts.length - 1]
    const needsMod = parts.includes("mod")
    const needsShift = parts.includes("shift")

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      if (typing && !allowInInput) return

      const mod = IS_MAC ? e.metaKey : e.ctrlKey
      if (needsMod !== mod) return
      if (needsShift !== e.shiftKey) return
      if (e.key.toLowerCase() !== key) return

      e.preventDefault()
      handlerRef.current()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [combo, allowInInput, enabled])
}

/**
 * Number que conta até o valor. Só anima quando o valor muda de fato — abrir a
 * tela não deve virar um festival de contadores toda vez que o cache revalida.
 */
export function useCountUp(value: number, duration = 550): number {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    if (reduce) {
      setDisplay(value)
      fromRef.current = value
      return
    }
    const from = fromRef.current
    if (from === value) return

    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      // ease-out: chega desacelerando, como toda entrada.
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration, reduce])

  return display
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

export function compactNumber(n: number): string {
  if (Math.abs(n) < 1000) return String(n)
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n)
}

export function currencyBRL(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0)
}

export function compactCurrencyBRL(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number.isFinite(n) ? n : 0)
}

export function percentDelta(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

// ---------------------------------------------------------------------------
// Sparkline — SVG puro, sem lib. Área + linha, escala automática.
// ---------------------------------------------------------------------------
export function Sparkline({
  values,
  className = "",
  tone = "brand",
  height = 28,
  showLast = true,
}: {
  values: number[]
  className?: string
  tone?: "brand" | "success" | "danger" | "neutral"
  height?: number
  showLast?: boolean
}) {
  const stroke = {
    brand: "text-brand-500",
    success: "text-success",
    danger: "text-danger",
    neutral: "text-paper-400",
  }[tone]

  const { line, area, lastPoint } = useMemo(() => {
    const w = 100
    const h = height
    if (values.length === 0) return { line: "", area: "", lastPoint: null }
    const max = Math.max(...values, 1)
    const min = Math.min(...values, 0)
    const span = max - min || 1
    const step = values.length > 1 ? w / (values.length - 1) : 0
    const points = values.map((v, i) => {
      const x = values.length > 1 ? i * step : w / 2
      // 1px de respiro em cima e embaixo pra linha não ser cortada pelo viewBox.
      const y = h - 1 - ((v - min) / span) * (h - 2)
      return [x, y] as const
    })
    const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
    const last = points[points.length - 1]
    return {
      line: d,
      area: `${d} L${w},${h} L0,${h} Z`,
      lastPoint: last,
    }
  }, [values, height])

  if (!line) return <div className={cx("h-7", className)} aria-hidden="true" />

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className={cx("w-full", stroke, className)}
      style={{ height }}
      aria-hidden="true"
      focusable="false"
    >
      <path d={area} fill="currentColor" opacity={0.12} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {showLast && lastPoint && (
        <circle cx={lastPoint[0]} cy={lastPoint[1]} r={1.8} fill="currentColor" />
      )}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Delta (variação vs período anterior)
// ---------------------------------------------------------------------------
export function Delta({
  value,
  suffix = "%",
  invert = false,
}: {
  value: number | null
  suffix?: string
  invert?: boolean
}) {
  if (value === null) {
    return <span className="text-[11px] font-medium text-paper-400">novo</span>
  }
  const flat = Math.abs(value) < 0.05
  // `invert`: em métricas onde cair é bom (falhas, tempo de ciclo).
  const good = invert ? value < 0 : value > 0
  return (
    <span
      className={cx(
        "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular",
        flat ? "text-paper-400" : good ? "text-success" : "text-danger",
      )}
    >
      {flat ? "→" : value > 0 ? "▲" : "▼"}
      {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  )
}

// ---------------------------------------------------------------------------
// MetricTile — o tijolo da barra de KPIs. Vira botão quando tem onClick.
// ---------------------------------------------------------------------------
export function MetricTile({
  label,
  value,
  rawValue,
  delta,
  deltaInvert,
  spark,
  sparkTone = "brand",
  icon,
  hint,
  tone = "neutral",
  active = false,
  onClick,
}: {
  label: string
  value: string
  /** Valor numérico para o count-up; ausente = texto renderizado direto. */
  rawValue?: number
  delta?: number | null
  deltaInvert?: boolean
  spark?: number[]
  sparkTone?: "brand" | "success" | "danger" | "neutral"
  icon?: ReactNode
  hint?: string
  tone?: "neutral" | "brand" | "success" | "warning" | "danger"
  active?: boolean
  onClick?: () => void
}) {
  const counted = useCountUp(rawValue ?? 0)
  const shown = rawValue === undefined ? value : compactNumber(counted)

  const toneCls = {
    neutral: "text-ink dark:text-paper",
    brand: "text-brand-600 dark:text-brand-300",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone]

  const Wrapper = onClick ? "button" : "div"

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      title={hint}
      className={cx(
        "group relative flex min-w-0 flex-col gap-1.5 rounded-lg border p-3 text-left transition-[background-color,border-color,box-shadow] duration-150",
        active
          ? "border-brand-300 bg-brand-50/70 dark:border-brand-500/50 dark:bg-brand-900/20"
          : "border-paper-200 bg-paper dark:border-ink-700 dark:bg-ink-900",
        onClick &&
          "focus-ring hover:border-paper-300 hover:bg-paper-50 dark:hover:border-ink-600 dark:hover:bg-ink-800",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-paper-500">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cx("text-xl font-semibold tabular leading-none", toneCls)}>{shown}</span>
        {delta !== undefined && <Delta value={delta} invert={deltaInvert} />}
      </div>
      {spark && spark.length > 1 && (
        <Sparkline values={spark} tone={sparkTone} height={22} className="mt-0.5" />
      )}
    </Wrapper>
  )
}

/** Grid responsivo dos KPIs. */
export function MetricStrip({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      className={cx(
        "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
        className,
      )}
    >
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// SegmentedControl — indicador desliza (layoutId) em vez de piscar.
// ---------------------------------------------------------------------------
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  size = "md",
  ariaLabel,
}: {
  options: { value: T; label: string; icon?: ReactNode; count?: number }[]
  value: T
  onChange: (value: T) => void
  layoutId: string
  size?: "sm" | "md"
  ariaLabel?: string
}) {
  const reduce = useReducedMotion()
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-paper-200 bg-paper-50 p-0.5 dark:border-ink-700 dark:bg-ink-900"
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cx(
              "relative flex items-center gap-1.5 rounded-md font-medium transition-colors focus-ring",
              size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
              active
                ? "text-ink dark:text-paper"
                : "text-paper-500 hover:text-ink dark:hover:text-paper",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={reduce ? { duration: 0 } : springSnappy}
                className="absolute inset-0 -z-10 rounded-md bg-paper shadow-xs dark:bg-ink-800"
              />
            )}
            {opt.icon}
            {opt.label}
            {opt.count !== undefined && (
              <span className="tabular text-[11px] text-paper-400">{opt.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FilterChip — filtro ligável/desligável, com contagem
// ---------------------------------------------------------------------------
export function FilterChip({
  label,
  count,
  active,
  onClick,
  dotClass,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
  dotClass?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors duration-150 focus-ring",
        active
          ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/50 dark:bg-brand-900/30 dark:text-brand-200"
          : "border-paper-200 bg-paper text-paper-600 hover:bg-paper-100 dark:border-ink-700 dark:bg-ink-900 dark:hover:bg-ink-800",
      )}
    >
      {dotClass && <span className={cx("size-1.5 rounded-full", dotClass)} />}
      {label}
      {count !== undefined && <span className="tabular text-paper-400">{count}</span>}
    </button>
  )
}

// ---------------------------------------------------------------------------
// SearchField — foco por ⌘F / "/", limpa com Esc
// ---------------------------------------------------------------------------
export function SearchField({
  value,
  onChange,
  placeholder = "Buscar…",
  hotkey = "mod+f",
  className = "",
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hotkey?: string | null
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useHotkey(hotkey ?? "mod+f", () => ref.current?.focus(), { enabled: hotkey !== null })

  return (
    <div className={cx("relative min-w-0 flex-1", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-paper-400" />
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("")
            ref.current?.blur()
          }
        }}
        className="h-8 w-full rounded-md border border-paper-200 bg-paper pl-8 pr-14 text-[13px] text-ink transition-colors placeholder:text-paper-400 focus-ring focus:border-brand-400 dark:border-ink-700 dark:bg-ink-900 dark:text-paper"
      />
      {hotkey !== null && !value && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
          <Kbd>{MOD_LABEL}F</Kbd>
        </span>
      )}
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar busca"
          className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-paper-400 transition-colors hover:text-ink focus-ring dark:hover:text-paper"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toolbar / Panel — moldura das seções
// ---------------------------------------------------------------------------
export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-2 rounded-lg border border-paper-200 bg-paper p-2 dark:border-ink-700 dark:bg-ink-900",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={cx(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border border-paper-200 bg-paper dark:border-ink-700 dark:bg-ink-900",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-paper-200 px-3 py-2 dark:border-ink-700">
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-[13px] font-semibold text-ink dark:text-paper">{title}</h2>
            )}
            {subtitle && <p className="truncate text-[11px] text-paper-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cx("min-w-0", bodyClassName)}>{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Barra de proporção — distribuição por canal/estágio em uma linha só
// ---------------------------------------------------------------------------
export function ShareBar({
  segments,
  className = "",
}: {
  segments: { key: string; label: string; value: number; className: string }[]
  className?: string
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0)
  if (!total) {
    return <div className={cx("h-1.5 rounded-full bg-paper-100 dark:bg-ink-800", className)} />
  }
  return (
    <div className={cx("flex h-1.5 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800", className)}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div
            key={s.key}
            className={cx("h-full transition-[width] duration-300 ease-out", s.className)}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}
          />
        ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Command palette — ⌘K. Ações da tela, filtráveis, navegáveis pelo teclado.
// ---------------------------------------------------------------------------
export interface CommandAction {
  id: string
  label: string
  hint?: string
  group?: string
  icon?: ReactNode
  shortcut?: string
  run: () => void
}

export function CommandPalette({
  open,
  onClose,
  actions,
  placeholder = "Buscar comando…",
}: {
  open: boolean
  onClose: () => void
  actions: CommandAction[]
  placeholder?: string
}) {
  const reduce = useReducedMotion()
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter((a) =>
      `${a.label} ${a.hint ?? ""} ${a.group ?? ""}`.toLowerCase().includes(q),
    )
  }, [actions, query])

  useEffect(() => {
    if (!open) return
    setQuery("")
    setIndex(0)
    // O autofocus precisa esperar o painel entrar na árvore.
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [open])

  useEffect(() => {
    setIndex(0)
  }, [query])

  const runAt = useCallback(
    (i: number) => {
      const action = filtered[i]
      if (!action) return
      onClose()
      action.run()
    },
    [filtered, onClose],
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        initial={reduce ? false : { opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: EASE }}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-lg border border-paper-200 bg-paper shadow-pop dark:border-ink-700 dark:bg-ink-900"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setIndex((i) => Math.min(i + 1, filtered.length - 1))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setIndex((i) => Math.max(i - 1, 0))
          } else if (e.key === "Enter") {
            e.preventDefault()
            runAt(index)
          } else if (e.key === "Escape") {
            e.preventDefault()
            onClose()
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-paper-200 px-3 dark:border-ink-700">
          <Search className="size-4 shrink-0 text-paper-400" />
          <input
            ref={inputRef}
            value={query}
            placeholder={placeholder}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 w-full bg-transparent text-sm text-ink outline-none placeholder:text-paper-400 dark:text-paper"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul role="listbox" className="max-h-80 overflow-y-auto p-1.5 scrollbar-slim">
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-[13px] text-paper-500">
              Nenhum comando encontrado.
            </li>
          )}
          {filtered.map((action, i) => (
            <li key={action.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                onMouseEnter={() => setIndex(i)}
                onClick={() => runAt(i)}
                className={cx(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
                  i === index
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
                    : "text-ink dark:text-paper",
                )}
              >
                <span className="shrink-0 text-paper-400">{action.icon}</span>
                <span className="min-w-0 flex-1 truncate">{action.label}</span>
                {action.hint && (
                  <span className="shrink-0 text-[11px] text-paper-400">{action.hint}</span>
                )}
                {action.shortcut && <Kbd>{action.shortcut}</Kbd>}
              </button>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  )
}

/** Encapsula estado + atalho ⌘K da paleta. */
export function useCommandPalette(actions: CommandAction[]) {
  const [open, setOpen] = useState(false)
  useHotkey("mod+k", () => setOpen((v) => !v), { allowInInput: true })
  const palette = (
    <AnimatePresence>
      {open && (
        <CommandPalette key="palette" open={open} onClose={() => setOpen(false)} actions={actions} />
      )}
    </AnimatePresence>
  )
  return { open, setOpen, palette }
}

// ---------------------------------------------------------------------------
// Linhas de lista com entrada em cascata (curta — isso repete muito)
// ---------------------------------------------------------------------------
export function StaggerList({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : "hidden"}
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.025 } } }}
    >
      {children}
    </motion.div>
  )
}

export const listRowVariants = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
}
