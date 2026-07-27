// Primitivas visuais do Command Deck: cartão, KPI com contador, sparkline e
// gauge radial.
//
// Motion: entrada em cascata quando o painel encosta no viewport (uma vez só —
// `once`), 60ms de defasagem entre irmãos. Só opacity/transform animam; nada de
// width/height, que forçariam layout a cada frame. Com `prefers-reduced-motion`
// tudo entra já no estado final e os contadores mostram o valor direto.
import { motion, useInView, useMotionValue, useReducedMotion, useSpring } from "framer-motion"
import { Download, type LucideIcon } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { Area, AreaChart, ResponsiveContainer } from "recharts"

import { cx } from "@/shared/ui/primitives"

import { MARK, mark } from "./deck.marks"
import { DECK, TONE } from "./deck.theme"

// ─── Cartão ──────────────────────────────────────────────────────────────────

export function DeckCard({
  title,
  subtitle,
  action,
  className,
  bodyClassName,
  index = 0,
  exportName,
  reveal = "self",
  children,
  ...rest
}: {
  title?: string
  subtitle?: string
  action?: ReactNode
  className?: string
  bodyClassName?: string
  /** Posição na cascata de entrada (só vale com `reveal="self"`). */
  index?: number
  /** Quando definido, mostra o botão de exportar PNG deste painel. */
  exportName?: string
  /**
   * Quem controla a entrada do cartão.
   *
   * - `"self"` (padrão): o próprio cartão revela ao encostar no viewport, via
   *   framer-motion. É o comportamento de qualquer uso avulso.
   * - `"external"`: o cartão não anima nada e nasce visível — quem manda é a
   *   timeline GSAP do deck (ver `deck.motion.ts`). Sem isto os dois motores
   *   disputariam a mesma `opacity` e o cartão piscaria.
   */
  reveal?: "self" | "external"
  children: ReactNode
  /** Marcadores `data-deck-*` que a timeline GSAP usa para achar o elemento. */
  [dataAttr: `data-${string}`]: unknown
}) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLElement>(null)
  const inViewSelf = useInView(ref, { once: true, margin: "-40px" })
  const external = reveal === "external"
  const inView = external || inViewSelf
  const [busy, setBusy] = useState(false)

  const exportPng = async () => {
    if (!ref.current || !exportName) return
    setBusy(true)
    try {
      const { elementToPng } = await import("./deck.export")
      await elementToPng(ref.current, exportName)
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.section
      ref={ref}
      {...rest}
      initial={reduce || external ? false : { opacity: 0, y: 16 }}
      animate={inView || reduce ? { opacity: 1, y: 0 } : undefined}
      transition={{
        duration: 0.42,
        ease: [0.16, 1, 0.3, 1],
        delay: reduce || external ? 0 : index * 0.06,
      }}
      style={{ background: DECK.surface, borderColor: DECK.border }}
      className={cx(
        "group/card relative overflow-hidden rounded-xl border shadow-[0_1px_0_0_rgb(255_255_255/0.04)_inset]",
        className,
      )}
    >
      {/* Realce superior: fio de luz de 1px, some para as bordas. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
      />
      {(title || action || exportName) && (
        <header className="flex items-start gap-3 px-4 pb-2 pt-3.5">
          <div className="min-w-0 flex-1">
            {title && (
              <h3 className="truncate text-[13px] font-semibold" style={{ color: DECK.text }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="truncate text-[11px]" style={{ color: DECK.textDim }}>
                {subtitle}
              </p>
            )}
          </div>
          {action}
          {exportName && (
            <button
              type="button"
              onClick={exportPng}
              disabled={busy}
              title={`Exportar "${title ?? exportName}" como PNG`}
              aria-label={`Exportar ${title ?? exportName} como imagem PNG`}
              className="grid size-7 shrink-0 place-items-center rounded-md text-white/35 opacity-0 transition-all duration-150 hover:bg-white/10 hover:text-white focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 disabled:opacity-40 group-hover/card:opacity-100 group-focus-within/card:opacity-100"
            >
              <Download className={cx("size-3.5", busy && "animate-pulse")} />
            </button>
          )}
        </header>
      )}
      <div className={cx("px-4 pb-4", bodyClassName)}>{children}</div>
    </motion.section>
  )
}

// ─── Contador animado ────────────────────────────────────────────────────────

/**
 * Conta de 0 até `value` com spring. Escreve direto no nó de texto (não passa
 * por estado do React) — 60fps sem re-render por frame.
 */
export function CountUp({
  value,
  format,
  className,
}: {
  value: number
  format: (n: number) => string
  className?: string
}) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const mv = useMotionValue(reduce ? value : 0)
  const spring = useSpring(mv, { stiffness: 90, damping: 22, restDelta: 0.5 })

  useEffect(() => {
    if (reduce) {
      if (ref.current) ref.current.textContent = format(value)
      return
    }
    mv.set(value)
  }, [value, reduce, mv, format])

  useEffect(() => {
    if (reduce) return
    return spring.on("change", (v) => {
      if (ref.current) ref.current.textContent = format(v)
    })
  }, [spring, format, reduce])

  // O texto inicial cobre SSR/reduced-motion e serve de fallback acessível.
  return (
    <span ref={ref} className={className}>
      {format(reduce ? value : 0)}
    </span>
  )
}

// ─── KPI ─────────────────────────────────────────────────────────────────────

export function KpiCard({
  label,
  value,
  format,
  hint,
  icon: Icon,
  delta,
  series,
  tone = "accent",
  index = 0,
  reveal = "self",
  onClick,
}: {
  label: string
  value: number
  format: (n: number) => string
  hint?: string
  icon: LucideIcon
  /** Variação percentual vs. período anterior. */
  delta?: number | null
  /** Série do sparkline (valores brutos, já na ordem cronológica). */
  series?: number[]
  tone?: keyof typeof TONE
  index?: number
  /** Repassado ao DeckCard: `"external"` cede a entrada à timeline do deck. */
  reveal?: "self" | "external"
  onClick?: () => void
}) {
  const color = TONE[tone]
  const Wrapper = onClick ? "button" : "div"

  return (
    <DeckCard index={index} reveal={reveal} bodyClassName="pb-3" {...mark(MARK.kpi)}>
      <Wrapper
        {...(onClick ? { type: "button" as const, onClick } : {})}
        className={cx(
          "block w-full text-left",
          onClick &&
            "rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className="grid size-6 place-items-center rounded-md"
            style={{ background: `${color}1F`, color }}
          >
            <Icon className="size-3.5" strokeWidth={2} />
          </span>
          <span
            className="truncate text-[11px] font-medium uppercase tracking-[0.12em]"
            style={{ color: DECK.textDim }}
          >
            {label}
          </span>
        </div>

        <p className="mt-2 text-[26px] font-semibold leading-none tabular" style={{ color: DECK.text }}>
          <CountUp value={value} format={format} />
        </p>

        <div className="mt-1.5 flex items-baseline gap-2">
          {typeof delta === "number" && (
            <span
              className="text-[11px] font-semibold tabular"
              style={{ color: delta >= 0 ? TONE.positive : TONE.negative }}
            >
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
            </span>
          )}
          {hint && (
            <span className="truncate text-[11px]" style={{ color: DECK.textFaint }}>
              {hint}
            </span>
          )}
        </div>

        {series && series.length > 1 && (
          <div className="mt-2 h-8" aria-hidden>
            <Sparkline data={series} color={color} />
          </div>
        )}
      </Wrapper>
    </DeckCard>
  )
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

export function Sparkline({ data, color }: { data: number[]; color: string }) {
  const id = `spark-${color.replace("#", "")}`
  const points = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${id})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Gauge radial ────────────────────────────────────────────────────────────

/**
 * Arco de progresso em SVG puro: o traço é desenhado via stroke-dashoffset
 * (propriedade que não dispara layout). Recharts seria exagero para um arco.
 */
export function RadialGauge({
  value,
  label,
  color = TONE.accent,
  size = 96,
  reveal = "self",
}: {
  /** 0–100. */
  value: number
  label: string
  color?: string
  size?: number
  /** `"external"`: o arco é desenhado pela timeline GSAP, não por aqui. */
  reveal?: "self" | "external"
}) {
  const reduce = useReducedMotion()
  const ref = useRef<SVGSVGElement>(null)
  const inViewSelf = useInView(ref, { once: true })
  const external = reveal === "external"
  const inView = external || inViewSelf
  const r = (size - 12) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))

  return (
    <div className="flex items-center gap-3">
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label}: ${pct.toFixed(0)} por cento`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(255 255 255 / 0.08)"
          strokeWidth={8}
        />
        <motion.circle
          {...mark(MARK.arc)}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={c}
          // Com reveal externo o arco nasce completo e o DrawSVG o desenha a
          // partir dali; deixar o framer-motion animar junto brigaria pelo
          // mesmo stroke-dashoffset.
          initial={{ strokeDashoffset: reduce || external ? c - (pct / 100) * c : c }}
          animate={inView ? { strokeDashoffset: c - (pct / 100) * c } : undefined}
          transition={{ duration: reduce || external ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fill={DECK.text}
          className="text-[15px] font-semibold tabular"
        >
          {pct.toFixed(0)}%
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-[12px] font-medium" style={{ color: DECK.text }}>
          {label}
        </p>
      </div>
    </div>
  )
}
