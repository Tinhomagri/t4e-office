// Página do calendário editorial — posts sociais do workspace inteiro.
import { EditorialCalendar } from "@/features/boards/views/EditorialCalendar"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { PageHeader } from "@/shared/ui/primitives"

export function EditorialCalendarPage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        eyebrow="Marketing"
        title="Calendário editorial"
        subtitle="Posts agendados e publicados nas redes do workspace."
      />
      {workspaceId ? (
        <EditorialCalendar workspaceId={workspaceId} />
      ) : (
        <p className="text-sm text-paper-400">Selecione um workspace.</p>
      )}
    </div>
  )
}
