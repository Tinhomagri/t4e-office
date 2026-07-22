// Página de analytics social — métricas consolidadas por canal do workspace.
import { SocialAnalytics } from "@/features/boards/views/SocialAnalytics"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { PageHeader } from "@/shared/ui/primitives"

export function SocialAnalyticsPage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        eyebrow="Marketing"
        title="Analytics social"
        subtitle="Desempenho dos posts publicados, por canal e no total."
      />
      {workspaceId ? (
        <SocialAnalytics workspaceId={workspaceId} />
      ) : (
        <p className="text-sm text-paper-400">Selecione um workspace.</p>
      )}
    </div>
  )
}
