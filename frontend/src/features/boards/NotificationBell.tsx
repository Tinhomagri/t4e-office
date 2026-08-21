import { useEffect, useRef, useState } from "react"
import { Bell, Check, CheckCheck, ExternalLink } from "lucide-react"
import { useNavigate } from "react-router-dom"
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationStream,
} from "@/features/workspace/workspace.hooks"
import type { Notification } from "@/features/workspace/workspace.types"
import { cx } from "@/shared/ui/primitives"

const TYPE_ICON: Record<string, string> = {
  card_assigned: "👤",
  card_commented: "💬",
  card_status_changed: "🔄",
  automation_ran: "⚡",
  sprint_started: "🏃",
  board_message: "💬",
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "agora"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [toastQueue, setToastQueue] = useState<Notification[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const { data: notifications } = useNotifications()
  const markAll = useMarkAllRead()
  const markOne = useMarkNotificationRead()

  const unreadCount = (notifications ?? []).filter((n) => !n.read).length

  // SSE: mensagem de cliente tem UI própria (bolinha de chat, ChatHeadsWidget)
  // — toast/bipe daqui duplicaria. Aqui só o resto (card atribuído, etc).
  useNotificationStream((n) => {
    if (n.type === "board_message") return
    setToastQueue((q) => [...q, n])
    setTimeout(() => setToastQueue((q) => q.filter((x) => x.id !== n.id)), 5_000)
  })

  // Close panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function handleNotifClick(n: Notification) {
    if (!n.read) markOne.mutate(n.id)
    if (n.link) navigate(n.link)
    setOpen(false)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "relative flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
          open
            ? "border-brand-300 bg-brand-50 text-brand-600"
            : "border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800",
        )}
        title="Notificações"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Toast stack */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toastQueue.map((n) => (
          <div
            key={n.id}
            className="flex items-start gap-3 rounded-xl border border-paper-200 bg-white p-3 shadow-lg min-w-72 max-w-80 pointer-events-auto animate-in slide-in-from-right-8 fade-in duration-300 dark:border-ink-700 dark:bg-ink-900"
          >
            <span className="text-lg leading-none">{TYPE_ICON[n.type] ?? "🔔"}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink dark:text-paper-100">{n.title}</p>
              {n.body && <p className="mt-0.5 truncate text-xs text-paper-500 dark:text-ink-300">{n.body}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-10 z-50 w-96 overflow-hidden rounded-2xl border border-paper-200 bg-white shadow-xl dark:border-ink-700 dark:bg-ink-900">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-paper-100 dark:border-ink-800 px-4 py-3">
            <span className="text-sm font-semibold text-ink dark:text-paper-100">
              Notificações {unreadCount > 0 && <span className="ml-1 text-red-500">({unreadCount} novas)</span>}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {!notifications?.length && (
              <div className="py-10 text-center text-sm text-paper-500 dark:text-ink-300">
                Nenhuma notificação
              </div>
            )}
            {(notifications ?? []).map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotifClick(n)}
                className={cx(
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-paper-50 dark:hover:bg-ink-800",
                  !n.read && "bg-blue-50/40 dark:bg-brand-900/20",
                )}
              >
                <span className="mt-0.5 text-base leading-none">{TYPE_ICON[n.type] ?? "🔔"}</span>
                <div className="min-w-0 flex-1">
                  <p className={cx("truncate text-sm", !n.read ? "font-semibold text-ink dark:text-paper-100" : "text-paper-700 dark:text-paper-300")}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="mt-0.5 truncate text-xs text-paper-500 dark:text-ink-300">{n.body}</p>
                  )}
                  <p className="mt-1 text-[10px] text-paper-400 dark:text-ink-400">{timeAgo(n.created_at)}</p>
                </div>
                {!n.read && (
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                )}
                {n.link && (
                  <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-paper-400 dark:text-ink-400" />
                )}
              </button>
            ))}
          </div>

          {notifications && notifications.length > 0 && (
            <div className="border-t border-paper-100 dark:border-ink-800 px-4 py-2">
              <button
                onClick={() => { markAll.mutate(); setOpen(false) }}
                className="flex items-center gap-1.5 text-xs text-paper-500 hover:text-ink dark:text-ink-300 dark:hover:text-paper-100"
              >
                <Check className="h-3 w-3" /> Limpar todas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
