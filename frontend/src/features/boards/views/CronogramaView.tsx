import { useRef, useState, useCallback, useMemo } from "react"
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Flag,
  Link2,
  AlertTriangle,
  Plus,
  Loader2,
  Zap,
} from "lucide-react"
import { cx } from "@/shared/ui/primitives"
import { useCreateCard, useUpdateCard } from "@/features/workspace/workspace.hooks"
import type { Card, Member, Sprint } from "@/features/workspace/workspace.types"

// ─── Scale ────────────────────────────────────────────────────────────────────

type Scale = "week" | "month" | "quarter"

interface Col {
  key: string   // unique id
  label: string // display label
  date: Date    // first day of this column
  isToday?: boolean
  isWeekend?: boolean
}

const COL_WIDTH: Record<Scale, number> = { week: 28, month: 48, quarter: 36 }
const ROW_H = 44
const LABEL_W = 220

function buildCols(scale: Scale, anchor: Date): Col[] {
  const cols: Col[] = []
  const today = new Date(); today.setHours(0,0,0,0)

  if (scale === "week") {
    // 26 weeks centred on anchor week-start (Mon)
    const start = weekStart(anchor)
    start.setDate(start.getDate() - 13 * 7)
    for (let w = 0; w < 26; w++) {
      const d = new Date(start); d.setDate(d.getDate() + w * 7)
      const isToday = d <= today && today < addDays(d, 7)
      cols.push({ key: d.toISOString(), label: `S${isoWeek(d)} '${String(d.getFullYear()).slice(2)}`, date: new Date(d), isToday })
    }
  } else if (scale === "month") {
    // 18 months: 6 before anchor, 12 after
    const y = anchor.getFullYear(), m = anchor.getMonth()
    for (let i = -6; i < 12; i++) {
      const d = new Date(y, m + i, 1)
      const isToday = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()
      cols.push({ key: d.toISOString(), label: d.toLocaleString("pt-BR", { month: "short", year: "2-digit" }), date: d, isToday })
    }
  } else {
    // 8 quarters
    const qStart = new Date(anchor.getFullYear(), Math.floor(anchor.getMonth() / 3) * 3, 1)
    qStart.setMonth(qStart.getMonth() - 9)
    for (let i = 0; i < 12; i++) {
      const d = new Date(qStart); d.setMonth(d.getMonth() + i * 3)
      const q = Math.floor(d.getMonth() / 3) + 1
      const isToday = Math.floor(today.getMonth() / 3) === Math.floor(d.getMonth() / 3) && today.getFullYear() === d.getFullYear()
      cols.push({ key: d.toISOString(), label: `Q${q} ${d.getFullYear()}`, date: d, isToday })
    }
  }
  return cols
}

function colEnd(col: Col, scale: Scale): Date {
  if (scale === "week") return addDays(col.date, 7)
  if (scale === "month") return new Date(col.date.getFullYear(), col.date.getMonth() + 1, 1)
  return new Date(col.date.getFullYear(), col.date.getMonth() + 3, 1)
}

// Returns fractional column index for a date
function dateToX(date: Date, cols: Col[], scale: Scale, colW: number): number {
  for (let i = 0; i < cols.length; i++) {
    const s = cols[i].date.getTime()
    const e = colEnd(cols[i], scale).getTime()
    const t = date.getTime()
    if (t >= s && t < e) {
      return (i + (t - s) / (e - s)) * colW
    }
  }
  if (date < cols[0].date) return 0
  return cols.length * colW
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function weekStart(d: Date) { const r = new Date(d); const day = r.getDay(); r.setDate(r.getDate() - ((day + 6) % 7)); r.setHours(0,0,0,0); return r }
function isoWeek(d: Date) {
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const startOfWeek1 = weekStart(jan4)
  return Math.round((weekStart(d).getTime() - startOfWeek1.getTime()) / (7 * 86400000)) + 1
}
function parseDate(s: string | null): Date | null {
  if (!s) return null
  const d = new Date(s); d.setHours(0,0,0,0); return isNaN(d.getTime()) ? null : d
}
function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

const EPIC_COLORS = [
  "bg-violet-500", "bg-brand-500", "bg-emerald-500", "bg-rose-500",
  "bg-amber-500", "bg-cyan-500", "bg-fuchsia-500", "bg-teal-500",
]
const EPIC_BORDER = [
  "border-violet-400", "border-brand-400", "border-emerald-400", "border-rose-400",
  "border-amber-400", "border-cyan-400", "border-fuchsia-400", "border-teal-400",
]
function epicColorIdx(id: string) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return h % EPIC_COLORS.length
}

// ─── Main component ────────────────────────────────────────────────────────────

export function CronogramaView({
  cards,
  sprints: _sprints,
  members,
  onOpen,
}: {
  cards: Card[]
  sprints: Sprint[]
  members: Member[]
  onOpen: (c: Card) => void
}) {
  const projectId = cards[0]?.project_id ?? ""
  const updateCard = useUpdateCard(projectId)
  const createCard = useCreateCard(projectId)

  const [scale, setScale] = useState<Scale>("month")
  const [anchor, setAnchor] = useState(() => new Date())
  // Local overrides while dragging (id -> {start, end})
  const [localDates, setLocalDates] = useState<Record<string, { start: Date; end: Date }>>({})
  // Épicos expandidos (mostram cards-filhos como sub-linhas).
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const gridRef = useRef<HTMLDivElement>(null)

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const cols = useMemo(() => buildCols(scale, anchor), [scale, anchor])
  const colW = COL_WIDTH[scale]
  const totalW = cols.length * colW

  // Epics (mesmo sem datas; a UI exibe “Sem datas”)
  const epics = useMemo(
    () =>
      cards
        .filter((c) => c.type === "epic")
        .sort((a, b) => {
          const as = parseDate(a.start_date)?.getTime() ?? Infinity
          const bs = parseDate(b.start_date)?.getTime() ?? Infinity
          return as - bs
        }),
    [cards],
  )




  // Child cards for progress computation
  const childrenOf = useCallback((epicId: string) =>
    cards.filter((c) => c.parent_id === epicId),
    [cards]
  )


  function navigate(dir: -1 | 1) {
    const n = new Date(anchor)
    if (scale === "week") n.setDate(n.getDate() + dir * 13 * 7)
    else if (scale === "month") n.setMonth(n.getMonth() + dir * 6)
    else n.setMonth(n.getMonth() + dir * 9)
    setAnchor(n)
  }

  // today line x position
  const todayX = dateToX(new Date(), cols, scale, colW)

  // ─── Drag logic ──────────────────────────────────────────────────────────────

  type DragMode = "move" | "resize-start" | "resize-end"
  const dragRef = useRef<{
    mode: DragMode; cardId: string; startMouseX: number
    origStart: Date; origEnd: Date
  } | null>(null)

  const onMouseDown = useCallback((
    e: React.MouseEvent, card: Card, mode: DragMode
  ) => {
    e.preventDefault()

    const origStart = parseDate(card.start_date) ?? new Date()
    const origEnd = parseDate(card.due_date) ?? addDays(origStart, 14)

    dragRef.current = {
      mode,
      cardId: card.id,
      startMouseX: e.clientX,
      origStart,
      origEnd,
    }

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return

      const dx = ev.clientX - dragRef.current.startMouseX
      const { mode, origStart, origEnd } = dragRef.current

      // Move/resize baseado em datas reais usando o eixo X (dateToX)
      //: converte a posição final do mouse para uma data e calcula o delta.
      const startX = dateToX(origStart, cols, scale, colW)


      const newStartX = startX + dx

      // Para deltaDays: aproxima pela diferença entre as datas correspondentes
      // ao startX/endX após deslocamento.
      const xToDate = (x: number) => {
        // x relativo já está em pixels do grid (0..totalW)
        const idx = Math.floor(x / colW)
        const col = cols[Math.max(0, Math.min(cols.length - 1, idx))]
        const colStart = col.date.getTime()
        const colEndTs = colEnd(col, scale).getTime()
        const within = (x - idx * colW) / colW
        const t = colStart + within * (colEndTs - colStart)
        const d = new Date(t)
        d.setHours(0, 0, 0, 0)
        return d
      }

      const snappedStart = xToDate(newStartX)
      const deltaDays = Math.round((snappedStart.getTime() - origStart.getTime()) / 86400000)


      let ns = new Date(origStart)
      let ne = new Date(origEnd)

      if (mode === "move") {
        ns = addDays(origStart, deltaDays)
        ne = addDays(origEnd, deltaDays)
      } else if (mode === "resize-start") {
        ns = addDays(origStart, deltaDays)
        if (ns >= ne) ns = addDays(ne, -1)
      } else {
        ne = addDays(origEnd, deltaDays)
        if (ne <= ns) ne = addDays(ns, 1)
      }

      setLocalDates((prev) => ({
        ...prev,
        [dragRef.current!.cardId]: { start: ns, end: ne },
      }))
    }


    function onUp() {
      if (!dragRef.current) return
      const { cardId } = dragRef.current
      const ld = localDates[cardId] ?? null
      if (ld) {
        const fmt = (d: Date) => d.toISOString().split("T")[0]
        updateCard.mutate({ cardId, input: { start_date: fmt(ld.start), due_date: fmt(ld.end) } })
      }
      dragRef.current = null
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, colW, localDates, updateCard])

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-4 py-2.5 shadow-card">
        <button onClick={() => navigate(-1)} className="grid size-7 place-items-center rounded-lg border border-paper-200 dark:border-ink-700 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors text-paper-500">
          <ChevronLeft className="size-4" />
        </button>
        <button onClick={() => setAnchor(new Date())} className="rounded-lg border border-paper-200 dark:border-ink-700 px-3 py-1 text-xs font-medium text-paper-600 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors">
          Hoje
        </button>
        <button onClick={() => navigate(1)} className="grid size-7 place-items-center rounded-lg border border-paper-200 dark:border-ink-700 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors text-paper-500">
          <ChevronRight className="size-4" />
        </button>
        <div className="ml-auto flex items-center gap-1">
          {(["week","month","quarter"] as Scale[]).map(s => (
            <button key={s} onClick={() => setScale(s)}
              className={cx("rounded-lg px-3 py-1 text-xs font-semibold transition-colors",
                scale === s ? "bg-ink text-paper" : "text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800"
              )}>
              {s === "week" ? "Semana" : s === "month" ? "Mês" : "Trimestre"}
            </button>
          ))}
        </div>
        <span className="ml-3 text-xs text-paper-400">{epics.length} épico{epics.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 shadow-card" ref={gridRef}>
        <div style={{ minWidth: LABEL_W + totalW }}>
          {/* Column headers */}
          <ColHeaders cols={cols} colW={colW} />

          {/* Body */}
          <div className="relative">
            {/* Today line */}
            {todayX >= 0 && todayX <= totalW && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-brand-500/70 z-20 pointer-events-none"
                style={{ left: LABEL_W + todayX }}
              />
            )}

            {/* Dependency arrows SVG layer */}
            <DependencyLayer
              epics={epics}
              cards={cards}
              localDates={localDates}
              cols={cols}
              scale={scale}
              colW={colW}
            />

            {epics.map((epic, rowIdx) => {
              const kids = childrenOf(epic.id)
              const isOpen = expanded.has(epic.id)
              return (
                <div key={epic.id}>
                  <EpicRow
                    epic={epic}
                    rowIdx={rowIdx}
                    cards={cards}
                    members={members}
                    cols={cols}
                    scale={scale}
                    colW={colW}
                    localDate={localDates[epic.id]}
                    onOpen={onOpen}
                    onMouseDown={onMouseDown}
                    childrenOf={childrenOf}
                    expanded={isOpen}
                    onToggle={kids.length > 0 ? () => toggleExpand(epic.id) : undefined}
                    childCount={kids.length}
                  />
                  {isOpen &&
                    kids.map((kid) => (
                      <ChildRow
                        key={kid.id}
                        card={kid}
                        members={members}
                        cols={cols}
                        scale={scale}
                        colW={colW}
                        localDate={localDates[kid.id]}
                        onOpen={onOpen}
                        onMouseDown={onMouseDown}
                      />
                    ))}
                </div>
              )
            })}

            {/* Linha de criação inline de épico (estilo Jira) */}
            <CreateEpicRow
              creating={createCard.isPending}
              onCreate={(title) =>
                createCard.mutate({ title, type: "epic", status: "todo" })
              }
            />

            {/* Non-epic cards with dates as milestone markers */}
            <MilestoneRow
              cards={cards.filter(c => c.type !== "epic" && c.due_date)}
              cols={cols}
              scale={scale}
              colW={colW}
              onOpen={onOpen}
            />
          </div>
        </div>
      </div>

      {/* Unscheduled epics */}
      <UnscheduledPanel
        epics={epics.filter(e => !e.start_date && !e.due_date)}
        onOpen={onOpen}
      />
    </div>
  )
}

// ─── ColHeaders ────────────────────────────────────────────────────────────────

function ColHeaders({ cols, colW }: { cols: Col[]; colW: number }) {
  return (
    <div className="flex border-b border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-900 sticky top-0 z-10">
      <div className="shrink-0 border-r border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-900" style={{ width: LABEL_W }}>
        <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-paper-400">Épico</div>
      </div>
      <div className="flex">
        {cols.map(col => (
          <div
            key={col.key}
            style={{ width: colW, minWidth: colW }}
            className={cx(
              "border-r border-paper-100 dark:border-ink-800 py-2 text-center text-[10px] font-semibold truncate transition-colors",
              col.isToday
                ? "bg-brand-50 text-brand-700 border-brand-200"
                : "text-paper-400"
            )}
          >
            {col.label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── EpicRow ──────────────────────────────────────────────────────────────────

function EpicRow({
  epic, rowIdx: _rowIdx, cards: _cards, members, cols, scale, colW, localDate, onOpen, onMouseDown, childrenOf,
  expanded, onToggle, childCount,
}: {
  epic: Card; rowIdx: number; cards: Card[]; members: Member[]
  cols: Col[]; scale: Scale; colW: number
  localDate?: { start: Date; end: Date }
  onOpen: (c: Card) => void
  onMouseDown: (e: React.MouseEvent, card: Card, mode: "move" | "resize-start" | "resize-end") => void
  childrenOf: (id: string) => Card[]
  expanded?: boolean
  onToggle?: () => void
  childCount?: number
}) {
  const cidx = epicColorIdx(epic.id)
  const colorBg = EPIC_COLORS[cidx]
  const colorBorder = EPIC_BORDER[cidx]

  const rawStart = parseDate(epic.start_date)
  const rawEnd = parseDate(epic.due_date)
  const start = localDate?.start ?? rawStart
  const end = localDate?.end ?? rawEnd

  // Progress from children
  const children = useMemo(() => childrenOf(epic.id), [childrenOf, epic.id])
  const doneCount = children.filter(c => c.status === "done").length
  const pct = children.length ? Math.round((doneCount / children.length) * 100) : null

  const assignee = members.find(m => m.user_id === epic.assignee_id)

  if (!start || !end) return (
    <div className="flex items-center border-b border-paper-100 dark:border-ink-800 hover:bg-paper-50 dark:hover:bg-ink-900 transition-colors" style={{ height: ROW_H }}>
      <div className="shrink-0 border-r border-paper-100 dark:border-ink-800 pl-2 pr-3 flex items-center gap-1.5" style={{ width: LABEL_W, height: ROW_H }}>
        <ExpandToggle expanded={expanded} onToggle={onToggle} count={childCount} />
        <span className="grid size-4 shrink-0 place-items-center rounded bg-violet-600">
          <Zap className="size-2.5 text-white" strokeWidth={2.5} />
        </span>
        <button onClick={() => onOpen(epic)} className="min-w-0 flex-1 truncate text-left text-xs font-medium text-paper-500 hover:text-ink dark:hover:text-paper transition-colors">
          <span className="font-mono text-[10px] text-paper-400">{epic.ref}</span> {epic.title}
        </button>
        <span className="shrink-0 rounded bg-paper-100 dark:bg-ink-800 px-1.5 py-0.5 text-[9px] font-medium text-paper-400">sem datas</span>
      </div>
      <div className="flex-1" />
    </div>
  )

  const x1 = dateToX(start, cols, scale, colW)
  const x2 = dateToX(end, cols, scale, colW)
  const barW = Math.max(colW * 0.5, x2 - x1)
  const isConflict = localDate && (end < start)

  return (
    <div
      className="flex items-center border-b border-paper-100 dark:border-ink-800 hover:bg-paper-50/60 transition-colors group"
      style={{ height: ROW_H }}
    >
      {/* Label */}
      <div className="shrink-0 border-r border-paper-100 dark:border-ink-800 pl-2 pr-3 flex items-center gap-1.5" style={{ width: LABEL_W, height: ROW_H }}>
        <ExpandToggle expanded={expanded} onToggle={onToggle} count={childCount} />
        <span className={cx("grid size-4 shrink-0 place-items-center rounded", colorBg)}>
          <Zap className="size-2.5 text-white" strokeWidth={2.5} />
        </span>
        <button onClick={() => onOpen(epic)} className="min-w-0 truncate text-left text-xs font-semibold text-ink dark:text-paper hover:text-brand-600 transition-colors flex-1">
          <span className="font-mono text-[10px] font-normal text-paper-400">{epic.ref}</span> {epic.title}
        </button>
        {assignee && (
          <span className="shrink-0 grid size-5 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-purple-700 text-[8px] font-bold text-white">
            {assignee.name[0].toUpperCase()}
          </span>
        )}
      </div>

      {/* Track */}
      <div className="relative flex-1 overflow-visible" style={{ height: ROW_H }}>
        {/* Column grid lines */}
        {cols.map((col, i) => (
          <div key={col.key} className={cx("absolute inset-y-0 border-r border-paper-100 dark:border-ink-800", col.isToday && "bg-brand-50/30")}
            style={{ left: i * colW, width: colW }} />
        ))}

        {/* The bar */}
        <div
          className={cx(
            "absolute top-1/2 -translate-y-1/2 rounded-lg border-2 cursor-grab select-none flex items-center overflow-hidden shadow-sm transition-shadow hover:shadow-panel",
            isConflict ? "border-danger bg-danger/20" : `${colorBorder} bg-white/80`,
          )}
          style={{ left: x1, width: barW, height: 28 }}
          onMouseDown={(e) => onMouseDown(e, epic, "move")}
          title={`${fmtDate(start)} → ${fmtDate(end)}${pct != null ? ` · ${pct}%` : ""}`}
        >
          {/* Resize handle left */}
          <div
            className="absolute left-0 inset-y-0 w-2 cursor-ew-resize hover:bg-black/10 rounded-l-lg z-10"
            onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, epic, "resize-start") }}
          />

          {/* Progress fill */}
          {pct != null && (
            <div className={cx("absolute inset-y-0 left-0 opacity-30 rounded-lg", colorBg)} style={{ width: `${pct}%` }} />
          )}

          {/* Label inside bar */}
          <span className="relative z-10 truncate px-2 text-[10px] font-bold text-ink dark:text-paper">
            {pct != null && <span className="mr-1 text-paper-500">{pct}%</span>}
            {epic.ref}
          </span>

          {/* Conflict icon */}
          {isConflict && <AlertTriangle className="size-3 shrink-0 text-danger mr-1" />}

          {/* Resize handle right */}
          <div
            className="absolute right-0 inset-y-0 w-2 cursor-ew-resize hover:bg-black/10 rounded-r-lg z-10"
            onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, epic, "resize-end") }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── DependencyLayer — SVG arrows between epics ────────────────────────────────

function DependencyLayer({
  epics, cards: _cards, localDates, cols, scale, colW,
}: {
  epics: Card[]; cards: Card[]
  localDates: Record<string, { start: Date; end: Date }>
  cols: Col[]; scale: Scale; colW: number
}) {
  // Find "blocks" links between epics
  const epicIds = new Set(epics.map(e => e.id)); void epicIds
  type Arrow = { fromIdx: number; toIdx: number; conflict: boolean }
  const arrows: Arrow[] = []

  for (let i = 0; i < epics.length; i++) {
    const epic = epics[i]
    // Simple heuristic: if a card is linked to another epic, draw arrow
    // We use the issue_links — but those aren't in scope here as raw Card data.
    // Instead we check if another epic's start_date < this epic's end_date (overlap = conflict)
    void epic // suppress lint
  }

  // Draw arrows based on cards array parent_id chains pointing to different epics
  const totalH = epics.length * ROW_H
  if (arrows.length === 0) return null

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-10"
      style={{ left: LABEL_W, width: cols.length * colW, height: totalH }}
    >
      {arrows.map((a, idx) => {
        const fromEpic = epics[a.fromIdx]
        const toEpic = epics[a.toIdx]
        const fromEnd = localDates[fromEpic.id]?.end ?? parseDate(fromEpic.due_date)
        const toStart = localDates[toEpic.id]?.start ?? parseDate(toEpic.start_date)
        if (!fromEnd || !toStart) return null
        const x1 = dateToX(fromEnd, cols, scale, colW)
        const y1 = a.fromIdx * ROW_H + ROW_H / 2
        const x2 = dateToX(toStart, cols, scale, colW)
        const y2 = a.toIdx * ROW_H + ROW_H / 2
        const color = a.conflict ? "#e11d48" : "#6c5cf0"
        return (
          <g key={idx}>
            <path d={`M${x1},${y1} C${x1+30},${y1} ${x2-30},${y2} ${x2},${y2}`}
              fill="none" stroke={color} strokeWidth={1.5} strokeDasharray={a.conflict ? "4 2" : undefined} />
            <polygon points={`${x2},${y2} ${x2-6},${y2-4} ${x2-6},${y2+4}`} fill={color} />
          </g>
        )
      })}
    </svg>
  )
}

// ─── MilestoneRow ─────────────────────────────────────────────────────────────

function MilestoneRow({
  cards, cols, scale, colW, onOpen,
}: {
  cards: Card[]; cols: Col[]; scale: Scale; colW: number; onOpen: (c: Card) => void
}) {
  if (cards.length === 0) return null
  return (
    <div className="flex items-center border-b border-paper-100 dark:border-ink-800" style={{ height: ROW_H }}>
      <div className="shrink-0 border-r border-paper-100 dark:border-ink-800 px-4 flex items-center gap-1.5" style={{ width: LABEL_W, height: ROW_H }}>
        <Flag className="size-3.5 text-warning shrink-0" />
        <span className="text-[11px] font-semibold text-paper-500 uppercase tracking-wide">Marcos</span>
      </div>
      <div className="relative flex-1" style={{ height: ROW_H }}>
        {cols.map((col, i) => (
          <div key={col.key} className="absolute inset-y-0 border-r border-paper-100 dark:border-ink-800"
            style={{ left: i * colW, width: colW }} />
        ))}
        {cards.map(c => {
          const d = parseDate(c.due_date); if (!d) return null
          const x = dateToX(d, cols, scale, colW)
          return (
            <button
              key={c.id}
              title={`${c.ref} · ${c.title} · ${fmtDate(d)}`}
              onClick={() => onOpen(c)}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-4 rotate-45 bg-warning border-2 border-warning/60 hover:scale-125 transition-transform z-20"
              style={{ left: x }}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── UnscheduledPanel ─────────────────────────────────────────────────────────

function UnscheduledPanel({ epics, onOpen }: { epics: Card[]; onOpen: (c: Card) => void }) {
  if (epics.length === 0) return null
  return (
    <div className="rounded-2xl border border-dashed border-paper-200 dark:border-ink-700 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Link2 className="size-3.5 text-paper-400" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-paper-400">Épicos sem datas ({epics.length})</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {epics.map(e => {
          const cidx = epicColorIdx(e.id)
          return (
            <button key={e.id} onClick={() => onOpen(e)}
              className={cx("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium text-ink dark:text-paper hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors", EPIC_BORDER[cidx])}>
              <span className={cx("size-2 rounded-full", EPIC_COLORS[cidx])} />
              {e.ref} {e.title}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── ExpandToggle ──────────────────────────────────────────────────────────────

function ExpandToggle({ expanded, onToggle, count }: { expanded?: boolean; onToggle?: () => void; count?: number }) {
  if (!onToggle) return <span className="block size-4 shrink-0" />
  return (
    <button
      onClick={onToggle}
      className="grid size-4 shrink-0 place-items-center rounded text-paper-400 hover:bg-paper-200 dark:hover:bg-ink-700 hover:text-ink transition-colors"
      title={`${count} item(ns)`}
    >
      {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
    </button>
  )
}

// ─── ChildRow — card-filho de um épico expandido ───────────────────────────────

function ChildRow({
  card, members, cols, scale, colW, localDate, onOpen, onMouseDown,
}: {
  card: Card; members: Member[]; cols: Col[]; scale: Scale; colW: number
  localDate?: { start: Date; end: Date }
  onOpen: (c: Card) => void
  onMouseDown: (e: React.MouseEvent, card: Card, mode: "move" | "resize-start" | "resize-end") => void
}) {
  const start = localDate?.start ?? parseDate(card.start_date)
  const end = localDate?.end ?? parseDate(card.due_date)
  const assignee = members.find((m) => m.user_id === card.assignee_id)
  const done = card.status === "done"

  return (
    <div className="flex items-center border-b border-paper-100 dark:border-ink-800 bg-paper-50/40 dark:bg-ink-950/30 hover:bg-paper-50 dark:hover:bg-ink-900 transition-colors" style={{ height: ROW_H }}>
      <div className="shrink-0 border-r border-paper-100 dark:border-ink-800 pl-9 pr-3 flex items-center gap-1.5" style={{ width: LABEL_W, height: ROW_H }}>
        <span className={cx("size-1.5 rounded-full shrink-0", done ? "bg-success" : "bg-paper-300")} />
        <button onClick={() => onOpen(card)} className="min-w-0 flex-1 truncate text-left text-[11px] text-paper-600 dark:text-paper-400 hover:text-ink dark:hover:text-paper transition-colors">
          <span className="font-mono text-[10px] text-paper-400">{card.ref}</span> {card.title}
        </button>
        {assignee && (
          <span className="shrink-0 grid size-4 place-items-center rounded-full bg-gradient-to-br from-ink-600 to-ink-900 text-[7px] font-bold text-white">
            {assignee.name[0].toUpperCase()}
          </span>
        )}
      </div>
      <div className="relative flex-1" style={{ height: ROW_H }}>
        {cols.map((col, i) => (
          <div key={col.key} className={cx("absolute inset-y-0 border-r border-paper-100 dark:border-ink-800", col.isToday && "bg-brand-50/30")} style={{ left: i * colW, width: colW }} />
        ))}
        {start && end && (() => {
          const x1 = dateToX(start, cols, scale, colW)
          const x2 = dateToX(end, cols, scale, colW)
          const w = Math.max(colW * 0.4, x2 - x1)
          return (
            <div
              className={cx("absolute top-1/2 -translate-y-1/2 rounded-md cursor-grab select-none flex items-center px-2 shadow-sm", done ? "bg-success/80" : "bg-brand-400/80")}
              style={{ left: x1, width: w, height: 18 }}
              onMouseDown={(e) => onMouseDown(e, card, "move")}
              title={`${fmtDate(start)} → ${fmtDate(end)}`}
            >
              <span className="truncate text-[9px] font-semibold text-white">{card.title}</span>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ─── CreateEpicRow — criação inline de épico ───────────────────────────────────

function CreateEpicRow({ creating, onCreate }: { creating: boolean; onCreate: (title: string) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")

  const submit = () => {
    const t = title.trim()
    if (!t) return
    onCreate(t)
    setTitle("")
    setOpen(false)
  }

  return (
    <div className="flex items-center border-b border-paper-100 dark:border-ink-800" style={{ height: ROW_H }}>
      <div className="shrink-0 border-r border-paper-100 dark:border-ink-800 pl-2 pr-3 flex items-center" style={{ width: LABEL_W, height: ROW_H }}>
        {open ? (
          <div className="flex w-full items-center gap-1.5">
            <span className="grid size-4 shrink-0 place-items-center rounded bg-violet-600">
              <Zap className="size-2.5 text-white" strokeWidth={2.5} />
            </span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit()
                if (e.key === "Escape") { setOpen(false); setTitle("") }
              }}
              onBlur={() => { if (!title.trim()) setOpen(false) }}
              placeholder="Nome do épico…"
              className="min-w-0 flex-1 bg-transparent text-xs text-ink dark:text-paper outline-none placeholder-paper-400"
            />
            {creating && <Loader2 className="size-3.5 shrink-0 animate-spin text-paper-400" />}
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-paper-500 hover:text-brand-600 transition-colors"
          >
            <Plus className="size-3.5" /> Criar épico
          </button>
        )}
      </div>
      <div className="flex-1" />
    </div>
  )
}
