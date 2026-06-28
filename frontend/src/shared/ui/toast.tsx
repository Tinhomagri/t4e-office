import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react"
import { create } from "zustand"

import { cx } from "./primitives"

type ToastKind = "success" | "error" | "info"

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: ToastItem[]
  push: (kind: ToastKind, message: string) => void
  dismiss: (id: number) => void
}

let _id = 0

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = ++_id
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

// API imperativa: toast.success("…"), toast.error("…"), toast.info("…").
export const toast = {
  success: (message: string) => useToastStore.getState().push("success", message),
  error: (message: string) => useToastStore.getState().push("error", message),
  info: (message: string) => useToastStore.getState().push("info", message),
}

const KIND_META: Record<ToastKind, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "text-green-600" },
  error: { icon: AlertCircle, className: "text-red-600" },
  info: { icon: Info, className: "text-blue-600" },
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => {
          const meta = KIND_META[t.kind]
          const Icon = meta.icon
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex items-start gap-2.5 rounded-md border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-3 py-2.5 shadow-pop"
            >
              <Icon className={cx("mt-0.5 size-4 shrink-0", meta.className)} />
              <p className="min-w-0 flex-1 text-sm text-ink dark:text-paper">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="grid size-5 shrink-0 place-items-center rounded text-paper-400 transition-colors hover:bg-paper-100 dark:hover:bg-ink-700 hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
