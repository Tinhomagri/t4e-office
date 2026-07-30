import { Select, StatusDot, PRESENCE_LABEL } from "@/shared/ui/primitives"
import type { PresenceStatus } from "@/features/workspace/workspace.types"

import { useSetStatus } from "./office.hooks"

const MANUAL_OPTIONS: PresenceStatus[] = ["available", "focus", "away"]

export function PresenceBar({
  workspaceId,
  onlineCount,
  readOnly = false,
}: {
  workspaceId: string
  onlineCount: number
  readOnly?: boolean
}) {
  const setStatus = useSetStatus(workspaceId)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 dark:border-ink-700 bg-paper dark:bg-ink-900 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-ink dark:text-paper">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="font-medium">{onlineCount}</span>
        <span className="text-paper-500">
          {onlineCount === 1 ? "pessoa na sala" : "pessoas na sala"}
        </span>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-paper-500">Meu status</span>
        <Select
          defaultValue="auto"
          disabled={readOnly || setStatus.isPending}
          onChange={(e) => {
            if (readOnly) return
            const v = e.target.value
            setStatus.mutate(v === "auto" ? null : (v as PresenceStatus))
          }}
          className="max-w-[190px]"
        >
          <option value="auto">Automático</option>
          {MANUAL_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {PRESENCE_LABEL[s]}
            </option>
          ))}
        </Select>
      </label>
    </div>
  )
}

// Legenda dos status (rodapé do escritório).
export function StatusLegend() {
  const all: PresenceStatus[] = ["available", "focus", "meeting", "away"]
  return (
    <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-paper-500">
      {all.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <StatusDot status={s} />
          {PRESENCE_LABEL[s]}
        </span>
      ))}
    </div>
  )
}
