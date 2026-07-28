// Editor de proposta: cabeçalho, tabela de itens e ações (baixar, enviar,
// registrar aceite/recusa).
//
// A tabela mostra prévia de subtotal/total enquanto o usuário digita, mas o
// valor que vale é o que volta da API — o domínio é a fonte da verdade do
// dinheiro. A prévia existe só para não digitar às cegas.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useState } from "react"
import { Download, GripVertical, Mail, Plus, Trash2, X } from "lucide-react"

import { Badge, Button, Field, Input, Textarea } from "@/shared/ui/primitives"

import {
  EMPTY_ITEM,
  STATUS_LABELS,
  STATUS_TONE,
  canSend,
  discountExceedsSubtotal,
  formatMoney,
  previewLineSubtotal,
  previewSubtotal,
  previewTotal,
  validityLabel,
} from "./proposals.shared"
import type { LineItemInput, Proposal, WinDealSuggestion } from "./proposals.types"

interface Props {
  proposal: Proposal
  saving: boolean
  sending: boolean
  onSave: (input: {
    title: string
    intro: string
    terms: string
    valid_until: string | null
    discount: string
    items: LineItemInput[]
  }) => void
  onSend: (toEmail: string, message: string) => void
  onDownload: () => void
  onAccept: () => void
  onReject: (reason: string) => void
  onClose: () => void
  suggestion: WinDealSuggestion | null
  onConfirmWin: (suggestion: WinDealSuggestion) => void
  onDismissSuggestion: () => void
}

export function ProposalDrawer({
  proposal,
  saving,
  sending,
  onSave,
  onSend,
  onDownload,
  onAccept,
  onReject,
  onClose,
  suggestion,
  onConfirmWin,
  onDismissSuggestion,
}: Props) {
  const reduced = useReducedMotion()
  const [title, setTitle] = useState(proposal.title)
  const [intro, setIntro] = useState(proposal.intro)
  const [terms, setTerms] = useState(proposal.terms)
  const [validUntil, setValidUntil] = useState(proposal.valid_until ?? "")
  const [discount, setDiscount] = useState(proposal.discount)
  const [items, setItems] = useState<LineItemInput[]>(
    proposal.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
    })),
  )
  const [sendOpen, setSendOpen] = useState(false)
  const [toEmail, setToEmail] = useState(proposal.sent_to)
  const [message, setMessage] = useState("")
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState("")

  // Troca de proposta reidrata o formulário.
  useEffect(() => {
    setTitle(proposal.title)
    setIntro(proposal.intro)
    setTerms(proposal.terms)
    setValidUntil(proposal.valid_until ?? "")
    setDiscount(proposal.discount)
    setItems(
      proposal.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
      })),
    )
    setToEmail(proposal.sent_to)
  }, [proposal])

  const editable = proposal.is_editable
  const subtotal = previewSubtotal(items)
  const total = previewTotal(items, discount)
  const discountInvalid = discountExceedsSubtotal(items, discount)

  function updateItem(index: number, patch: Partial<LineItemInput>) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    )
  }

  return (
    <motion.aside
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full w-full flex-col overflow-hidden border-l border-paper-300 bg-paper dark:border-ink-800 dark:bg-ink-900"
    >
      {/* Cabeçalho */}
      <header className="flex items-start gap-3 border-b border-paper-300 px-4 py-3 dark:border-ink-800">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[11px] text-paper-500">
            <span className="tabular-nums">Proposta nº {proposal.number}</span>
            <Badge tone={STATUS_TONE[proposal.status]}>{STATUS_LABELS[proposal.status]}</Badge>
            {proposal.is_expired && <Badge tone="warning">Vencida</Badge>}
          </p>
          <h2 className="mt-1 truncate text-sm font-semibold text-ink dark:text-paper">
            {proposal.customer_name || proposal.deal_title}
          </h2>
          <p className="text-[12px] text-paper-500">{validityLabel(proposal)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar proposta"
          className="grid size-8 place-items-center rounded-md text-paper-500 transition-colors duration-100 hover:bg-paper-100 focus-ring dark:hover:bg-ink-800"
        >
          <X className="size-4" />
        </button>
      </header>

      {/* Sugestão de ganhar o negócio, após o aceite */}
      <AnimatePresence>
        {suggestion && (
          <motion.div
            key="suggestion"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden border-b border-success/40 bg-success/10"
          >
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <p className="min-w-0 flex-1 text-[12px] text-ink dark:text-paper">
                Proposta aceita. Marcar <strong>{suggestion.deal_title}</strong> como ganho por{" "}
                <strong>{formatMoney(suggestion.amount, suggestion.currency)}</strong>?
              </p>
              <Button size="sm" onClick={() => onConfirmWin(suggestion)}>
                Ganhar negócio
              </Button>
              <Button variant="ghost" size="sm" onClick={onDismissSuggestion}>
                Agora não
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <Field label="Título da proposta">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!editable}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Válida até">
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              disabled={!editable}
            />
          </Field>
          <Field label="Desconto (R$)">
            <Input
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              disabled={!editable}
              className={discountInvalid ? "border-danger" : ""}
            />
          </Field>
        </div>
        {discountInvalid && (
          <p className="-mt-2 text-[12px] text-danger">
            O desconto não pode ser maior que o subtotal.
          </p>
        )}

        <Field label="Texto de abertura">
          <Textarea
            rows={2}
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            disabled={!editable}
            placeholder="Apresentação que abre o orçamento…"
          />
        </Field>

        {/* Itens */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-ink dark:text-paper">Itens</h3>
            {editable && (
              <Button
                variant="outline"
                size="sm"
                icon={<Plus className="size-3.5" />}
                onClick={() => setItems((current) => [...current, { ...EMPTY_ITEM }])}
              >
                Adicionar item
              </Button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="rounded-md border border-dashed border-paper-300 px-3 py-6 text-center text-[12px] text-paper-500 dark:border-ink-700">
              Nenhum item. Uma proposta sem item não pode ser enviada.
            </p>
          ) : (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {items.map((item, index) => (
                  <motion.li
                    key={index}
                    layout
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="rounded-md border border-paper-300 p-2 dark:border-ink-700"
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical
                        className="mt-2 size-3.5 shrink-0 text-paper-400"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(index, { description: e.target.value })}
                          placeholder="Descrição do item"
                          disabled={!editable}
                          aria-label={`Descrição do item ${index + 1}`}
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            inputMode="decimal"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, { quantity: e.target.value })}
                            placeholder="Qtd."
                            disabled={!editable}
                            aria-label={`Quantidade do item ${index + 1}`}
                          />
                          <Input
                            inputMode="decimal"
                            value={item.unit_price}
                            onChange={(e) => updateItem(index, { unit_price: e.target.value })}
                            placeholder="Valor unit."
                            disabled={!editable}
                            aria-label={`Valor unitário do item ${index + 1}`}
                          />
                          <p className="flex h-10 items-center justify-end pr-1 text-[13px] font-medium tabular-nums text-ink dark:text-paper">
                            {formatMoney(previewLineSubtotal(item), proposal.currency)}
                          </p>
                        </div>
                      </div>
                      {editable && (
                        <button
                          type="button"
                          onClick={() =>
                            setItems((current) => current.filter((_, i) => i !== index))
                          }
                          aria-label={`Remover item ${index + 1}`}
                          className="mt-1 grid size-8 shrink-0 place-items-center rounded-md text-paper-500 transition-colors duration-100 hover:bg-danger/10 hover:text-danger focus-ring"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>

        {/* Totais (prévia local; o valor oficial vem da API ao salvar) */}
        <dl className="space-y-1 rounded-md bg-paper-100 p-3 text-[13px] dark:bg-ink-800">
          <div className="flex justify-between">
            <dt className="text-paper-600">Subtotal</dt>
            <dd className="tabular-nums text-ink dark:text-paper">
              {formatMoney(subtotal, proposal.currency)}
            </dd>
          </div>
          {Number(discount) > 0 && (
            <div className="flex justify-between">
              <dt className="text-paper-600">Desconto</dt>
              <dd className="tabular-nums text-ink dark:text-paper">
                − {formatMoney(discount, proposal.currency)}
              </dd>
            </div>
          )}
          <div className="flex justify-between border-t border-paper-300 pt-1 font-semibold dark:border-ink-700">
            <dt className="text-ink dark:text-paper">Total</dt>
            <dd className="tabular-nums text-ink dark:text-paper">
              {formatMoney(total, proposal.currency)}
            </dd>
          </div>
        </dl>

        <Field label="Condições comerciais">
          <Textarea
            rows={3}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            disabled={!editable}
            placeholder="Prazo de pagamento, escopo, garantias…"
          />
        </Field>

        {proposal.status === "rejected" && proposal.rejection_reason && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-ink dark:text-paper">
            <strong>Motivo da recusa:</strong> {proposal.rejection_reason}
          </p>
        )}
      </div>

      {/* Ações */}
      <footer className="space-y-2 border-t border-paper-300 p-3 dark:border-ink-800">
        <AnimatePresence initial={false}>
          {sendOpen && (
            <motion.div
              key="send"
              initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="space-y-2 overflow-hidden"
            >
              <Input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="e-mail do cliente"
                aria-label="E-mail do destinatário"
              />
              <Textarea
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Mensagem do e-mail (opcional)"
                aria-label="Mensagem do e-mail"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  loading={sending}
                  disabled={!toEmail.trim()}
                  onClick={() => {
                    onSend(toEmail.trim(), message)
                    setSendOpen(false)
                  }}
                >
                  Enviar com PDF anexo
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSendOpen(false)}>
                  Cancelar
                </Button>
              </div>
            </motion.div>
          )}

          {rejectOpen && (
            <motion.div
              key="reject"
              initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="space-y-2 overflow-hidden"
            >
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo da recusa"
                aria-label="Motivo da recusa"
              />
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    onReject(reason)
                    setRejectOpen(false)
                  }}
                >
                  Registrar recusa
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRejectOpen(false)}>
                  Cancelar
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button
              size="sm"
              loading={saving}
              disabled={discountInvalid}
              onClick={() =>
                onSave({
                  title,
                  intro,
                  terms,
                  valid_until: validUntil || null,
                  discount: discount || "0",
                  items: items.filter((item) => item.description.trim()),
                })
              }
            >
              Salvar
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="size-3.5" />}
            onClick={onDownload}
          >
            PDF
          </Button>
          {editable && (
            <Button
              variant="outline"
              size="sm"
              icon={<Mail className="size-3.5" />}
              disabled={!canSend(items)}
              title={canSend(items) ? undefined : "Adicione um item antes de enviar"}
              onClick={() => setSendOpen((open) => !open)}
            >
              Enviar
            </Button>
          )}
          {proposal.status === "sent" && (
            <>
              <Button variant="outline" size="sm" onClick={onAccept}>
                Cliente aceitou
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRejectOpen((open) => !open)}
              >
                Recusou
              </Button>
            </>
          )}
        </div>
      </footer>
    </motion.aside>
  )
}
