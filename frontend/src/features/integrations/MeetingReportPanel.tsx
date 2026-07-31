// Relatório de participação/tempo em reunião — estilo "Insights" do Google
// Calendar: cards de métrica neutros + ranking de participantes com barra.
import { motion } from "framer-motion"
import { BarChart3, Clock, TrendingUp, Users } from "lucide-react"

import { extractApiError } from "@/shared/api/client"
import { Spinner } from "@/shared/ui/primitives"
import { AttendeeAvatar } from "./IntegrationsPage"
import { useMeetingReport } from "./integrations.hooks"

function formatMinutes(min: number): string {
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h${m}min` : `${h}h`
}

const RANGE_DAYS = 30

export function MeetingReportPanel() {
  const report = useMeetingReport(true, RANGE_DAYS)

  return (
    <motion.section
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 shadow-card"
    >
      <div className="flex items-center gap-2 border-b border-paper-100 dark:border-ink-800 px-5 py-3">
        <BarChart3 className="size-4 text-brand-500" />
        <h3 className="text-sm font-semibold text-ink dark:text-paper">Participação em reuniões</h3>
        <span className="text-xs text-paper-400">· últimos {RANGE_DAYS} dias</span>
      </div>

      {report.isLoading && (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      )}

      {report.isError && (
        <p className="px-5 py-4 text-sm text-danger">{extractApiError(report.error)}</p>
      )}

      {report.data && (
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricTile
              icon={Users}
              label="Reuniões"
              value={String(report.data.total_meetings)}
            />
            <MetricTile
              icon={Clock}
              label="Tempo total"
              value={formatMinutes(report.data.total_minutes)}
            />
            <MetricTile
              icon={TrendingUp}
              label="Média por call"
              value={formatMinutes(Math.round(report.data.average_minutes))}
            />
            <MetricTile
              icon={BarChart3}
              label="Dia mais cheio"
              value={report.data.busiest_weekday ? capitalize(report.data.busiest_weekday) : "—"}
            />
          </div>

          {report.data.top_attendees.length > 0 && (
            <div className="mt-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-paper-400">
                Com quem você mais se reúne
              </p>
              <div className="space-y-2.5">
                {report.data.top_attendees.map((a) => {
                  const max = report.data!.top_attendees[0].minutes || 1
                  const pct = Math.max(6, Math.round((a.minutes / max) * 100))
                  return (
                    <div key={a.email} className="flex items-center gap-3">
                      <AttendeeAvatar email={a.email} size="xs" />
                      <span className="w-40 shrink-0 truncate text-sm text-ink dark:text-paper">{a.email}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-24 shrink-0 text-right text-xs text-paper-400">
                        {a.meetings} call{a.meetings !== 1 ? "s" : ""} · {formatMinutes(a.minutes)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {report.data.total_meetings === 0 && (
            <p className="mt-4 text-sm text-paper-400">Nenhuma reunião com Meet nos últimos {RANGE_DAYS} dias.</p>
          )}
        </div>
      )}
    </motion.section>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl bg-paper-50 dark:bg-ink-800/60 px-4 py-3.5">
      <Icon className="size-4 text-paper-400" />
      <p className="mt-2 text-xl font-bold text-ink dark:text-paper">{value}</p>
      <p className="text-xs text-paper-400">{label}</p>
    </div>
  )
}
