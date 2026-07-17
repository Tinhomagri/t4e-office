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
    <div className="space-y-4">
      <PageHeader
        title="Escritório Virtual"
        subtitle="Clique no chão para andar — todos veem em tempo real"
      />
      <PresenceBar workspaceId={workspaceId} onlineCount={onlineCount} />
      <OfficeRoom workspaceId={workspaceId} myConfig={config} />
      <StatusLegend />
    </div>
  )
}
