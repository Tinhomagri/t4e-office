import { useMemo, useState } from "react"
import { History, ShieldCheck, SlidersHorizontal, Users } from "lucide-react"

import { useAuthStore } from "@/features/auth/auth.store"
import { EmptyState, PageHeader, Spinner } from "@/shared/ui/primitives"

import { useMembers, useWorkspaces } from "../workspace.hooks"
import { AuditTab } from "./AuditTab"
import { CapabilitiesTab } from "./CapabilitiesTab"
import { MembersTab } from "./MembersTab"
import { ProjectPermissionsTab } from "./ProjectPermissionsTab"
import { TabBar, type TabDef } from "./shared"

type TabId = "members" | "project-perms" | "capabilities" | "audit"

const TABS: TabDef<TabId>[] = [
  { id: "members", label: "Membros", icon: <Users className="size-4" /> },
  {
    id: "project-perms",
    label: "Permissões de projeto",
    icon: <SlidersHorizontal className="size-4" />,
  },
  {
    id: "capabilities",
    label: "Capacidades",
    icon: <ShieldCheck className="size-4" />,
  },
  { id: "audit", label: "Auditoria", icon: <History className="size-4" /> },
]

export function MembersPage() {
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
        title="Nenhum workspace"
        description="Crie um workspace na aba Boards para gerenciar membros e permissões."
      />
    )
  }

  return <MembersInner workspaceId={activeWorkspaceId} />
}

function MembersInner({ workspaceId }: { workspaceId: string }) {
  const [tab, setTab] = useState<TabId>("members")
  const me = useAuthStore((s) => s.user)
  const members = useMembers(workspaceId)

  const myRole = useMemo(
    () => (members.data ?? []).find((m) => m.user_id === me?.id)?.role ?? null,
    [members.data, me?.id],
  )
  const canManage = myRole === "owner" || myRole === "admin"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Membros & Permissões"
        subtitle="Equipe do workspace, papéis, acesso por projeto e auditoria"
      />

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === "members" && <MembersTab workspaceId={workspaceId} />}
      {tab === "project-perms" && (
        <ProjectPermissionsTab workspaceId={workspaceId} />
      )}
      {tab === "capabilities" && <CapabilitiesTab workspaceId={workspaceId} />}
      {tab === "audit" && (
        <AuditTab workspaceId={workspaceId} canView={canManage} />
      )}
    </div>
  )
}
