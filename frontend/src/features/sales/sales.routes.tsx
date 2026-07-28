// Adaptadores de rota do space Comercial: as views existentes recebem o
// workspace do layout (via outlet context) em vez de props do antigo sistema de
// abas. As telas ainda sem bounded context no backend usam ComingSoon — sem
// dados falsos.
import { useOutletContext } from "react-router-dom"

import { InboxPage } from "@/features/inbox/InboxPage"

import { ActivitiesView } from "./views/ActivitiesView"
import { CustomersView } from "./views/CustomersView"
import { GoalsView } from "./views/GoalsView"
import { LeadsView } from "./views/LeadsView"
import { PipelineView } from "./views/PipelineView"
import { ProposalsView } from "./views/ProposalsView"

interface SalesOutletContext {
  workspaceId: string
}

/** O layout só renderiza o Outlet com workspace selecionado — daí o non-null. */
function useSalesWorkspace(): string {
  return useOutletContext<SalesOutletContext>().workspaceId
}

export function PipelineRoute() {
  return <PipelineView workspaceId={useSalesWorkspace()} />
}

export function CustomersRoute() {
  return <CustomersView workspaceId={useSalesWorkspace()} />
}

export function ActivitiesRoute() {
  return <ActivitiesView workspaceId={useSalesWorkspace()} />
}

/** Caixa de entrada do Chatwoot embutida no Comercial. */
export function InboxRoute() {
  return <InboxPage workspaceId={useSalesWorkspace()} />
}

export function LeadsRoute() {
  return <LeadsView workspaceId={useSalesWorkspace()} />
}

export function ProposalsRoute() {
  return <ProposalsView workspaceId={useSalesWorkspace()} />
}

export function GoalsRoute() {
  return <GoalsView workspaceId={useSalesWorkspace()} />
}
