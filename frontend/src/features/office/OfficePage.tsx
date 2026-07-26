import { useEffect } from "react"
import { Link } from "react-router-dom"
import { Users } from "lucide-react"

import { useAvatarStore } from "@/features/avatar/avatar.store"
import { useWorkspaces } from "@/features/workspace/workspace.hooks"
import { Button, EmptyState, PageHeader, Spinner } from "@/shared/ui/primitives"

import { saveAvatarConfig } from "./office.api"
import { useMyAvatar, useRoom } from "./office.hooks"
import { OfficeRoom } from "./OfficeRoom"
import { PresenceBar, StatusLegend } from "./PresenceBar"

export function OfficePage() {
  const { data: workspaces, isLoading, activeWorkspaceId } = useWorkspaces()

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    )
  }
  if (!workspaces || workspaces.length === 0 || !activeWorkspaceId) {
    return (
      <EmptyState
        icon={<Users className="size-6" />}
        title="Nenhum workspace"
        description="Crie um workspace na aba Boards para entrar no Escritório."
      />
    )
  }

  return <OfficeInner workspaceId={activeWorkspaceId} />
}

function OfficeInner({ workspaceId }: { workspaceId: string }) {
  const backendAvatar = useMyAvatar()
  const localConfig = useAvatarStore((s) => s.config)
  const localCreated = useAvatarStore((s) => s.created)
  const room = useRoom(workspaceId)

  // Se o avatar existe local mas ainda não no servidor, persiste para que os
  // outros consigam te ver na sala.
  useEffect(() => {
    if (backendAvatar.isLoading) return
    if (!backendAvatar.data && localCreated) {
      saveAvatarConfig(localConfig).then(() => backendAvatar.refetch())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendAvatar.isLoading, backendAvatar.data, localCreated])

  const config = backendAvatar.data ?? (localCreated ? localConfig : null)

  if (backendAvatar.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    )
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Escritório Virtual"
          subtitle="Presença da equipe em tempo real"
        />
        <EmptyState
          icon={<Users className="size-6" />}
          title="Monte seu avatar primeiro"
          description="Seu avatar é sua presença no Escritório. Crie-o para entrar na sala."
          action={
            <Link to="/app/avatar">
              <Button>Criar avatar</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const onlineCount = room.data?.length ?? 1

  return (
    <div className="fixed inset-0 z-30 bg-[#1a1712]">
      <OfficeRoom workspaceId={workspaceId} myConfig={config} />

      {/* Presença e legenda viram overlay: em tela cheia não há onde empilhar. */}
      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[min(92vw,44rem)] flex-col gap-2">
        <div className="pointer-events-auto rounded-lg bg-ink-950/70 p-2 backdrop-blur-sm">
          <PresenceBar workspaceId={workspaceId} onlineCount={onlineCount} />
        </div>
        <div className="pointer-events-auto rounded-lg bg-ink-950/70 p-2 backdrop-blur-sm">
          <StatusLegend />
        </div>
      </div>

      <Link
        to="/app"
        className="absolute right-3 top-3 rounded-lg bg-ink-950/70 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur-sm hover:bg-ink-950/90 focus-ring"
      >
        Sair do escritório
      </Link>
    </div>
  )
}
