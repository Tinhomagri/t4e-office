import { useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import { Users } from "lucide-react"

import { useAvatarStore } from "@/features/avatar/avatar.store"
import { useWorkspaces } from "@/features/workspace/workspace.hooks"
import { Button, EmptyState, PageHeader, Spinner } from "@/shared/ui/primitives"

import { saveAvatarConfig } from "./office.api"
import { useMyAvatar, useRoom } from "./office.hooks"
import { OfficeRoom } from "./OfficeRoom"
import { PresenceBar, StatusLegend } from "./PresenceBar"
import { useWorldStore } from "./world.store"
import { MOCK_WORKSPACE_ID, isOfficeMock } from "./office.mock"
import { randomAvatar } from "@/features/avatar/avatar.random"

// A rota fica fora do AppShell (é uma cena 3D em tela cheia — ver router.tsx),
// então nenhum destes estados tem sidebar/header para voltar. `BackLink` supre
// isso; sem ele, carregando ou sem workspace vira beco sem saída.
function BackLink() {
  return (
    <Link
      to="/app"
      className="fixed left-3 top-3 z-10 rounded-lg bg-ink-950/70 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur-sm hover:bg-ink-950/90 focus-ring"
    >
      ← Voltar
    </Link>
  )
}

export function OfficePage() {
  const mock = isOfficeMock()
  const { data: workspaces, isLoading, activeWorkspaceId } = useWorkspaces(!mock)

  if (mock) return <OfficeInner workspaceId={MOCK_WORKSPACE_ID} mock />

  if (isLoading) {
    return (
      <div className="grid h-screen place-items-center">
        <BackLink />
        <Spinner />
      </div>
    )
  }
  if (!workspaces || workspaces.length === 0 || !activeWorkspaceId) {
    return (
      <div className="grid h-screen place-items-center px-6">
        <BackLink />
        <EmptyState
          icon={<Users className="size-6" />}
          title="Nenhum workspace"
          description="Crie um workspace na aba Boards para entrar no Escritório."
        />
      </div>
    )
  }

  return <OfficeInner workspaceId={activeWorkspaceId} />
}

function OfficeInner({ workspaceId, mock = false }: { workspaceId: string; mock?: boolean }) {
  const backendAvatar = useMyAvatar(!mock)
  const localConfig = useAvatarStore((s) => s.config)
  const localCreated = useAvatarStore((s) => s.created)
  const floor = useWorldStore((s) => s.floor)
  const room = useRoom(mock ? null : workspaceId, floor)
  const mockConfig = useMemo(() => randomAvatar(42, "Admin Demo"), [])

  // Se o avatar existe local mas ainda não no servidor, persiste para que os
  // outros consigam te ver na sala.
  useEffect(() => {
    if (mock || backendAvatar.isLoading) return
    if (!backendAvatar.data && localCreated) {
      saveAvatarConfig(localConfig).then(() => backendAvatar.refetch())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendAvatar.isLoading, backendAvatar.data, localCreated, mock])

  const config = backendAvatar.data ?? (localCreated ? localConfig : null)

  if (!mock && backendAvatar.isLoading) {
    return (
      <div className="grid h-screen place-items-center">
        <BackLink />
        <Spinner />
      </div>
    )
  }

  if (!mock && !config) {
    return (
      <div className="mx-auto h-screen max-w-2xl space-y-6 px-6 pt-20">
        <BackLink />
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

  const activeConfig = mock ? mockConfig : config!
  const onlineCount = mock ? 25 : (room.data?.length ?? 1)

  return (
    // `fixed inset-0` não é mais um hack para cobrir o AppShell — a rota já
    // roda fora dele — mas continua sendo a forma mais simples de garantir
    // tela cheia independente do que o resto da árvore fizer.
    <div className="fixed inset-0 z-30 bg-[#1a1712]">
      <OfficeRoom workspaceId={workspaceId} myConfig={activeConfig} mock={mock} />

      {/* Presença e legenda viram overlay: em tela cheia não há onde empilhar. */}
      <div className="pointer-events-none absolute bottom-3 right-3 flex max-w-[min(92vw,44rem)] flex-col gap-2">
        <div className="pointer-events-auto rounded-lg bg-ink-950/70 p-2 backdrop-blur-sm">
          <PresenceBar workspaceId={workspaceId} onlineCount={onlineCount} readOnly={mock} />
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
