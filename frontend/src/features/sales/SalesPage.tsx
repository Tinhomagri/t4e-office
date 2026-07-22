// Shell do módulo Comercial: abas Pipeline · Clientes · Atividades.
// O indicador da aba ativa usa layoutId — desliza entre as abas em vez de
// piscar, dando continuidade espacial à navegação.
import { AnimatePresence, motion } from "framer-motion"
import { Building2, ListTodo, Target } from "lucide-react"
import { useState } from "react"

import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { EASE, springSnappy } from "@/shared/lib/motion"
import { EmptyState, PageHeader, cx } from "@/shared/ui/primitives"

import { ActivitiesView } from "./views/ActivitiesView"
import { CustomersView } from "./views/CustomersView"
import { PipelineView } from "./views/PipelineView"

type SalesTab = "pipeline" | "customers" | "activities"

const TABS: { id: SalesTab; label: string; icon: typeof Target }[] = [
  { id: "pipeline", label: "Pipeline", icon: Target },
  { id: "customers", label: "Clientes", icon: Building2 },
  { id: "activities", label: "Atividades", icon: ListTodo },
]

export function SalesPage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const [tab, setTab] = useState<SalesTab>("pipeline")

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Comercial"
        subtitle="Funil de vendas, clientes e follow-ups do time."
      />

      {/* Abas: rolam horizontalmente no mobile, alvo de toque de 44px. */}
      <div
        role="tablist"
        aria-label="Seções do comercial"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-slim sm:mx-0 sm:px-0"
      >
        {TABS.map((t) => {
          const active = tab === t.id
          const Icon = t.icon
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cx(
                "relative flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-colors focus-ring",
                active
                  ? "text-brand-700 dark:text-brand-300"
                  : "text-paper-500 hover:bg-paper-100 hover:text-ink dark:hover:bg-ink-800 dark:hover:text-paper",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sales-tab-pill"
                  transition={springSnappy}
                  className="absolute inset-0 -z-10 rounded-xl bg-brand-50 dark:bg-brand-900/30"
                />
              )}
              <Icon className="size-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {!workspaceId ? (
        <EmptyState
          title="Selecione um workspace"
          description="O funil comercial é organizado por workspace."
        />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            {tab === "pipeline" && <PipelineView workspaceId={workspaceId} />}
            {tab === "customers" && <CustomersView workspaceId={workspaceId} />}
            {tab === "activities" && <ActivitiesView workspaceId={workspaceId} />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}
