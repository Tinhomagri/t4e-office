// Adaptadores de rota do space Comercial: as views existentes recebem o
// workspace do layout (via outlet context) em vez de props do antigo sistema de
// abas. As telas ainda sem bounded context no backend usam ComingSoon — sem
// dados falsos.
import { FileText, Trophy, UserSearch } from "lucide-react"
import { useOutletContext } from "react-router-dom"

import { InboxPage } from "@/features/inbox/InboxPage"
import { ComingSoon } from "@/shared/ui/ComingSoon"

import { ActivitiesView } from "./views/ActivitiesView"
import { CustomersView } from "./views/CustomersView"
import { PipelineView } from "./views/PipelineView"

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
  return (
    <ComingSoon
      icon={UserSearch}
      eyebrow="Comercial"
      title="Leads & prospecção"
      subtitle="A entrada do funil: captar, qualificar e converter em negócio."
      phase="Backend pendente"
      features={[
        "Captação de leads por formulário, importação CSV e origem de campanha",
        "Qualificação com score e motivo de descarte",
        "Conversão de lead em cliente + negócio, sem redigitar dados",
        "Fila de trabalho por responsável com SLA de primeiro contato",
        "Vínculo com campanhas do space Marketing para medir origem",
      ]}
    />
  )
}

export function ProposalsRoute() {
  return (
    <ComingSoon
      icon={FileText}
      eyebrow="Comercial"
      title="Propostas & orçamentos"
      subtitle="Gerar a proposta a partir do negócio e acompanhar o aceite."
      phase="Backend pendente"
      features={[
        "Itens de linha com quantidade, preço e desconto",
        "Geração de PDF e envio por e-mail ao cliente",
        "Versionamento: histórico de revisões da mesma proposta",
        "Aceite do cliente sugere marcar o negócio como ganho",
        "Valor da proposta sincronizado com o valor do negócio",
      ]}
    />
  )
}

export function GoalsRoute() {
  return (
    <ComingSoon
      icon={Trophy}
      eyebrow="Comercial"
      title="Metas & forecast"
      subtitle="Quanto cada vendedor precisa fechar e o quanto já está encaminhado."
      phase="Backend pendente"
      features={[
        "Meta por vendedor e por mês, com atingimento acumulado",
        "Forecast ponderado comparado à meta do período",
        "Ranking do time e evolução mês a mês",
        "Alerta quando o funil aberto não cobre a meta restante",
        "Fechamento do mês congelado para histórico",
      ]}
    />
  )
}
