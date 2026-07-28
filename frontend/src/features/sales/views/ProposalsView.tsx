// Tela de Propostas & orçamentos: lista à esquerda, editor à direita.
//
// Substitui o ComingSoon. Uma proposta nasce sempre de um negócio do funil —
// não existe proposta solta, porque o aceite precisa realimentar o pipeline.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useMemo, useState } from "react"
import { FileText, Plus } from "lucide-react"

import { Badge, Button, EmptyState, Select, Skeleton, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

import { ProposalDrawer } from "../ProposalDrawer"
import {
  useAcceptProposal,
  useCreateProposal,
  useProposals,
  useRejectProposal,
  useSendProposal,
  useUpdateProposal,
} from "../proposals.hooks"
import * as proposalsApi from "../proposals.api"
import {
  STATUS_LABELS,
  STATUS_TONE,
  formatDate,
  formatMoney,
  sortProposals,
} from "../proposals.shared"
import type { WinDealSuggestion } from "../proposals.types"
import { useDeals, useWinDeal } from "../sales.hooks"

interface Props {
  workspaceId: string
}

export function ProposalsView({ workspaceId }: Props) {
  const reduced = useReducedMotion()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newDealId, setNewDealId] = useState("")
  const [suggestion, setSuggestion] = useState<WinDealSuggestion | null>(null)

  const { data: proposals = [], isLoading } = useProposals(workspaceId)
  const { data: deals = [] } = useDeals(workspaceId)

  const create = useCreateProposal(workspaceId)
  const update = useUpdateProposal(workspaceId)
  const send = useSendProposal(workspaceId)
  const accept = useAcceptProposal(workspaceId)
  const reject = useRejectProposal(workspaceId)
  const winDeal = useWinDeal(workspaceId)

  const ordered = useMemo(() => sortProposals(proposals), [proposals])
  const active = ordered.find((p) => p.id === activeId) ?? null

  // Negócios ainda abertos — propor para um deal já fechado é quase sempre engano.
  const openDeals = useMemo(() => deals.filter((deal) => !deal.won_at && !deal.lost_at), [deals])

  async function handleDownload() {
    if (!active) return
    try {
      await proposalsApi.openProposalPdf(active.id, active.number)
    } catch {
      toast.error("Não foi possível gerar o PDF.")
    }
  }

  if (!isLoading && ordered.length === 0 && !creating) {
    return (
      <EmptyState
        icon={<FileText className="size-6" />}
        title="Nenhuma proposta ainda"
        description="A proposta nasce de um negócio do funil: os itens viram o orçamento, e o aceite realimenta o pipeline."
        action={
          openDeals.length > 0 ? (
            <Button icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
              Nova proposta
            </Button>
          ) : (
            <p className="text-[12px] text-paper-500">
              Crie um negócio no pipeline primeiro.
            </p>
          )
        }
      />
    )
  }

  return (
    <div className="flex h-[calc(100vh-20rem)] min-h-[480px] overflow-hidden rounded-lg border border-paper-300 bg-paper dark:border-ink-800 dark:bg-ink-900">
      {/* Lista */}
      <div className="flex w-full flex-col border-r border-paper-300 md:w-[340px] md:shrink-0 dark:border-ink-800">
        <div className="flex items-center justify-between border-b border-paper-300 p-2 dark:border-ink-800">
          <h2 className="px-1 text-[13px] font-semibold text-ink dark:text-paper">
            Propostas
          </h2>
          <Button
            size="sm"
            variant="outline"
            icon={<Plus className="size-3.5" />}
            onClick={() => setCreating((open) => !open)}
            disabled={openDeals.length === 0}
          >
            Nova
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {creating && (
            <motion.div
              key="new"
              initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="space-y-2 overflow-hidden border-b border-paper-300 p-2 dark:border-ink-800"
            >
              <Select
                value={newDealId}
                onChange={(e) => setNewDealId(e.target.value)}
                aria-label="Negócio de origem"
              >
                <option value="">Escolha o negócio…</option>
                {openDeals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.title} · {deal.customer_name}
                  </option>
                ))}
              </Select>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={!newDealId}
                  loading={create.isPending}
                  onClick={() =>
                    create.mutate(
                      { deal_id: newDealId, items: [] },
                      {
                        onSuccess: (proposal) => {
                          setActiveId(proposal.id)
                          setCreating(false)
                          setNewDealId("")
                        },
                      },
                    )
                  }
                >
                  Criar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                  Cancelar
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 rounded-md" />
              ))}
            </div>
          ) : (
            <ul>
              {ordered.map((proposal) => (
                <li key={proposal.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(proposal.id)
                      setSuggestion(null)
                    }}
                    aria-current={proposal.id === activeId ? "true" : undefined}
                    className={cx(
                      "w-full border-b border-paper-200 px-3 py-2.5 text-left transition-colors duration-100 focus-ring dark:border-ink-800",
                      proposal.id === activeId
                        ? "bg-brand-500/[0.08]"
                        : "hover:bg-paper-100 dark:hover:bg-ink-800",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-ink dark:text-paper">
                        nº {proposal.number} · {proposal.customer_name || proposal.deal_title}
                      </span>
                      <Badge tone={STATUS_TONE[proposal.status]}>
                        {STATUS_LABELS[proposal.status]}
                      </Badge>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2 text-[12px]">
                      <span className="truncate text-paper-600">{proposal.title}</span>
                      <span className="shrink-0 font-medium tabular-nums text-ink dark:text-paper">
                        {formatMoney(proposal.total, proposal.currency)}
                      </span>
                    </span>
                    {proposal.sent_at && (
                      <span className="mt-0.5 block text-[11px] text-paper-500">
                        Enviada em {formatDate(proposal.sent_at)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="hidden min-w-0 flex-1 md:block">
        {active ? (
          <ProposalDrawer
            key={active.id}
            proposal={active}
            saving={update.isPending}
            sending={send.isPending}
            suggestion={suggestion}
            onClose={() => setActiveId(null)}
            onSave={(input) => update.mutate({ id: active.id, input })}
            onSend={(toEmail, message) =>
              send.mutate({ id: active.id, input: { to_email: toEmail, message } })
            }
            onDownload={() => void handleDownload()}
            onAccept={() =>
              accept.mutate(active.id, {
                onSuccess: (result) => {
                  toast.success("Aceite registrado.")
                  // A sugestão de ganhar o negócio é decisão do vendedor.
                  setSuggestion(result.suggestion)
                },
              })
            }
            onReject={(reason) => reject.mutate({ id: active.id, reason })}
            onConfirmWin={(hint) => {
              winDeal.mutate(
                { dealId: hint.deal_id, input: { create_delivery_project: false } },
                { onSuccess: () => setSuggestion(null) },
              )
            }}
            onDismissSuggestion={() => setSuggestion(null)}
          />
        ) : (
          <div className="grid h-full place-items-center p-8">
            <EmptyState
              icon={<FileText className="size-6" />}
              title="Escolha uma proposta"
              description="Selecione na lista ao lado para editar, baixar o PDF ou enviar ao cliente."
            />
          </div>
        )}
      </div>
    </div>
  )
}
