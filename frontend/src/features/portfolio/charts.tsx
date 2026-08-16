// Mini-charts recharts compartilhados entre os relatórios de projeto e de
// integrante do Portfólio — mesma linguagem visual do Central de Relatórios
// (paleta estilo Power BI), em componentes pequenos o bastante pra caber num
// card de sidebar.
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export const BRAND = "#8270DB"

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-paper-200 bg-paper/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-ink-700 dark:bg-ink-900/95">
      {label != null && <p className="mb-1 font-semibold text-ink dark:text-paper">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: p.color || p.payload?.color }} />
          <span className="text-paper-500">{p.name}:</span>
          <span className="font-semibold tabular text-ink dark:text-paper">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export function MiniDonut({
  rows,
  total,
  centerLabel,
  size = 128,
}: {
  rows: { label: string; color: string; count: number }[]
  total: number
  centerLabel: string
  size?: number
}) {
  const inner = size * 0.32
  const outer = size * 0.47
  if (total === 0) {
    return (
      <div
        className="grid place-items-center rounded-full border-2 border-dashed border-paper-200 text-[11px] text-paper-400 dark:border-ink-700"
        style={{ width: size, height: size }}
      >
        Sem dados
      </div>
    )
  }
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="count" nameKey="label" innerRadius={inner} outerRadius={outer} paddingAngle={2} stroke="none">
            {rows.map((r, i) => <Cell key={i} fill={r.color} />)}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular text-ink dark:text-paper">{total}</span>
        <span className="text-[9px] text-paper-400">{centerLabel}</span>
      </div>
    </div>
  )
}

// Barra horizontal de carga (peso) por pessoa/coluna — usada pra "quem está
// carregando" um projeto ou uma prioridade.
export function WorkloadBars({
  rows,
}: {
  rows: { key: string; label: string; value: number; color: string; sub?: string }[]
}) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  if (rows.length === 0) return <p className="text-sm text-paper-400">Sem dados.</p>
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="truncate text-paper-500">{r.label}</span>
            <span className="shrink-0 font-medium tabular text-ink dark:text-paper">
              {r.value}
              {r.sub && <span className="ml-1 font-normal text-paper-400">{r.sub}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(r.value / max) * 100}%`, backgroundColor: r.color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function fmtWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return `${d.getDate()}/${d.getMonth() + 1}`
}
function weekStart(iso: string): string {
  const d = new Date(iso)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

// Vazão semanal (criados vs. concluídos) das últimas N semanas, a partir de
// uma lista de cards já filtrada (por projeto ou por pessoa). Função pura —
// não é hook, pra poder ser chamada depois de returns condicionais (loading,
// "não encontrado") nas páginas de detalhe sem violar regras de hooks.
export function weeklyThroughput(
  cards: { created_at: string | null; resolution?: string | null; resolved_at?: string | null; updated_at: string | null }[],
  weeksCount = 8,
) {
  const weeks: string[] = []
  const base = new Date(); base.setHours(0, 0, 0, 0)
  const start = weekStart(base.toISOString())
  for (let i = weeksCount - 1; i >= 0; i--) {
    const d = new Date(start + "T00:00:00")
    d.setDate(d.getDate() - i * 7)
    weeks.push(d.toISOString().slice(0, 10))
  }
  const created = new Map<string, number>()
  const completed = new Map<string, number>()
  for (const c of cards) {
    if (c.created_at) {
      const w = weekStart(c.created_at)
      created.set(w, (created.get(w) ?? 0) + 1)
    }
    const doneAt = c.resolution === "done" ? (c.resolved_at ?? c.updated_at) : null
    if (doneAt) {
      const w = weekStart(doneAt)
      completed.set(w, (completed.get(w) ?? 0) + 1)
    }
  }
  return weeks.map((w) => ({ week: w, criados: created.get(w) ?? 0, concluidos: completed.get(w) ?? 0 }))
}

export function ThroughputArea({ data }: { data: { week: string; criados: number; concluidos: number }[] }) {
  const has = data.some((d) => d.criados > 0 || d.concluidos > 0)
  if (!has) {
    return (
      <div className="flex h-[140px] items-center justify-center rounded-xl border border-dashed border-paper-200 text-xs text-paper-400 dark:border-ink-700">
        Sem atividade nas últimas semanas.
      </div>
    )
  }
  return (
    <div className="h-[140px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 4, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="member-cr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9F8FEF" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#9F8FEF" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="member-cc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1F845A" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#1F845A" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
          <XAxis dataKey="week" tickFormatter={fmtWeek} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={22} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} labelFormatter={(v) => `Semana de ${fmtWeek(String(v))}`} />
          <Area type="monotone" dataKey="criados" name="Criados" stroke="#9F8FEF" strokeWidth={2} fill="url(#member-cr)" />
          <Area type="monotone" dataKey="concluidos" name="Concluídos" stroke="#1F845A" strokeWidth={2} fill="url(#member-cc)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// Barras de peso por sub-grupo (ex.: cards por prioridade), pra quando um
// donut fica denso demais e uma barra horizontal comunica melhor.
export function MiniBarChart({ rows }: { rows: { label: string; value: number; color: string }[] }) {
  const has = rows.some((r) => r.value > 0)
  if (!has) {
    return (
      <div className="flex h-[100px] items-center justify-center text-xs text-paper-400">
        Sem dados.
      </div>
    )
  }
  return (
    <div className="h-[100px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(130,112,219,0.06)" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {rows.map((r, i) => <Cell key={i} fill={r.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
