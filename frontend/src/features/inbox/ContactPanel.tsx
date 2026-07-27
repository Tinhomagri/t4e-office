// Painel direito: quem é o contato e a que negócio essa conversa pertence.
//
// A metade de cima replica o painel do Chatwoot (dados do contato, atributos,
// conversas anteriores). A metade de baixo é nossa: o vínculo com o funil, que
// é o motivo de o atendimento morar dentro do Comercial.
//
// Movimento: painel desliza 12px ao trocar de conversa; o seletor de vínculo
// abre com height animado. Hover em 100ms.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useState } from "react"
import {
  AtSign,
  Building2,
  Globe,
  Link2,
  Link2Off,
  MapPin,
  Phone,
  Target,
} from "lucide-react"

import { useCustomers, useDeals } from "@/features/sales/sales.hooks"
import { cx } from "@/shared/ui/primitives"

import { DUR, panelIn, respectMotion } from "./inbox.motion"
import { initials, relativeTime, STATUS_LABELS } from "./inbox.shared"
import type { ChatContact, Conversation } from "./inbox.types"

const CONTROL =
  "h-8 w-full rounded-md border border-cw-border bg-white px-2 text-[12px] text-cw-ink transition-colors duration-100 focus-ring focus:border-cw-500 dark:border-ink-700 dark:bg-ink-800 dark:text-paper"

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cw-muted">
        {title}
      </h4>
      {children}
    </section>
  )
}

interface Props {
  workspaceId: string
  conversation: Conversation
  contact?: ChatContact
  previousConversations: Conversation[]
  onSelectConversation: (id: number) => void
  onLink: (link: { deal_id?: string | null; customer_id?: string | null }) => void
  onUnlink: () => void
  linking: boolean
}

export function ContactPanel({
  workspaceId,
  conversation,
  contact,
  previousConversations,
  onSelectConversation,
  onLink,
  onUnlink,
  linking,
}: Props) {
  const reduced = useReducedMotion()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [customerId, setCustomerId] = useState("")
  const [dealId, setDealId] = useState("")

  const { data: customers = [] } = useCustomers(pickerOpen ? workspaceId : null)
  const { data: deals = [] } = useDeals(
    pickerOpen && customerId ? workspaceId : null,
    customerId || null,
  )

  const name = contact?.name || conversation.contact?.name || "Sem nome"
  const email = contact?.email || conversation.contact?.email || ""
  const phone = contact?.phone_number || conversation.contact?.phone_number || ""
  const avatar = contact?.avatar_url || conversation.contact?.avatar_url || ""
  const linked = conversation.link.deal_id || conversation.link.customer_id

  // Atributos personalizados definidos no Chatwoot pelo admin.
  const customEntries = Object.entries(contact?.custom_attributes ?? {}).filter(
    ([, value]) => value !== null && value !== "" && value !== undefined,
  )

  return (
    <motion.aside
      // Trocar de conversa remonta o painel — daí o slide entrar de novo.
      key={conversation.id}
      variants={respectMotion(panelIn, reduced)}
      initial="hidden"
      animate="show"
      className="flex w-full flex-col gap-4 overflow-y-auto border-l border-cw-border bg-white p-4 lg:w-[300px] lg:shrink-0 dark:border-ink-800 dark:bg-ink-900"
    >
      {/* Identidade */}
      <div className="flex flex-col items-center text-center">
        {avatar ? (
          <img src={avatar} alt="" className="size-16 rounded-full object-cover" />
        ) : (
          <span className="grid size-16 place-items-center rounded-full bg-cw-surface text-lg font-semibold text-cw-muted dark:bg-ink-700 dark:text-paper-300">
            {initials(name)}
          </span>
        )}
        <h3 className="mt-2 text-[13px] font-semibold text-cw-ink dark:text-paper">{name}</h3>
        {contact?.company_name && (
          <p className="text-[12px] text-cw-muted">{contact.company_name}</p>
        )}
        {contact?.availability_status === "online" && (
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-green-600">
            <span className="size-1.5 rounded-full bg-green-500" /> Online
          </span>
        )}
      </div>

      <PanelSection title="Contato">
        <ul className="space-y-1 text-[12px]">
          {email && (
            <li className="flex items-center gap-2 text-cw-ink dark:text-paper-300">
              <AtSign className="size-3.5 shrink-0 text-cw-muted" />
              <a
                href={`mailto:${email}`}
                className="truncate transition-colors duration-100 hover:text-cw-600"
              >
                {email}
              </a>
            </li>
          )}
          {phone && (
            <li className="flex items-center gap-2 text-cw-ink dark:text-paper-300">
              <Phone className="size-3.5 shrink-0 text-cw-muted" />
              <a
                href={`tel:${phone}`}
                className="truncate transition-colors duration-100 hover:text-cw-600"
              >
                {phone}
              </a>
            </li>
          )}
          {contact?.city && (
            <li className="flex items-center gap-2 text-cw-ink dark:text-paper-300">
              <MapPin className="size-3.5 shrink-0 text-cw-muted" />
              <span className="truncate">
                {contact.city}
                {contact.country && `, ${contact.country}`}
              </span>
            </li>
          )}
          {conversation.channel && (
            <li className="flex items-center gap-2 text-cw-ink dark:text-paper-300">
              <Globe className="size-3.5 shrink-0 text-cw-muted" />
              <span className="truncate">{conversation.channel.replace("Channel::", "")}</span>
            </li>
          )}
          {!email && !phone && !contact?.city && (
            <li className="text-cw-muted">Sem dados de contato.</li>
          )}
        </ul>
      </PanelSection>

      {customEntries.length > 0 && (
        <PanelSection title="Atributos">
          <dl className="space-y-1 text-[12px]">
            {customEntries.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-2">
                <dt className="truncate text-cw-muted">{key}</dt>
                <dd className="truncate font-medium text-cw-ink dark:text-paper">
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </PanelSection>
      )}

      {/* Ponte com o funil — a parte que o Chatwoot não tem */}
      <section className="space-y-2 rounded-md border border-cw-border p-3 dark:border-ink-800">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cw-muted">
          Negócio no funil
        </h4>

        <AnimatePresence mode="wait" initial={false}>
          {linked ? (
            <motion.div
              key="linked"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.micro }}
              className="space-y-2"
            >
              {conversation.link.deal_title && (
                <p className="flex items-start gap-2 text-[13px] font-medium text-cw-ink dark:text-paper">
                  <Target className="mt-0.5 size-3.5 shrink-0 text-cw-500" />
                  <span className="min-w-0 break-words">{conversation.link.deal_title}</span>
                </p>
              )}
              {conversation.link.customer_name && (
                <p className="flex items-center gap-2 text-[12px] text-cw-muted">
                  <Building2 className="size-3.5 shrink-0" />
                  <span className="truncate">{conversation.link.customer_name}</span>
                </p>
              )}
              <button
                type="button"
                onClick={onUnlink}
                disabled={linking}
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-[12px] font-medium text-cw-muted transition-colors duration-100 hover:bg-cw-surface disabled:opacity-50 focus-ring dark:hover:bg-ink-800"
              >
                <Link2Off className="size-3.5" /> Desvincular
              </button>
            </motion.div>
          ) : pickerOpen ? (
            <motion.div
              key="picker"
              initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: DUR.ui, ease: "easeOut" }}
              className="space-y-2 overflow-hidden"
            >
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value)
                  setDealId("")
                }}
                aria-label="Cliente"
                className={CONTROL}
              >
                <option value="">Escolha o cliente…</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>

              {customerId && (
                <select
                  value={dealId}
                  onChange={(e) => setDealId(e.target.value)}
                  aria-label="Negócio"
                  className={CONTROL}
                >
                  <option value="">Só o cliente (sem negócio)</option>
                  {deals.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.title}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!customerId || linking}
                  onClick={() => {
                    onLink({ deal_id: dealId || null, customer_id: customerId || null })
                    setPickerOpen(false)
                  }}
                  className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-cw-500 text-[12px] font-semibold text-white transition-colors duration-100 hover:bg-cw-600 disabled:opacity-40 focus-ring"
                >
                  Vincular
                </button>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="inline-flex h-8 items-center justify-center rounded-md px-3 text-[12px] font-medium text-cw-muted transition-colors duration-100 hover:bg-cw-surface focus-ring dark:hover:bg-ink-800"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.micro }}
              className="space-y-2"
            >
              <p className="text-[12px] text-cw-muted">
                Esta conversa ainda não está ligada a nenhum negócio.
              </p>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-cw-border text-[12px] font-medium text-cw-ink transition-colors duration-100 hover:bg-cw-surface focus-ring dark:border-ink-700 dark:text-paper dark:hover:bg-ink-800"
              >
                <Link2 className="size-3.5" /> Vincular ao funil
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <PanelSection title="Conversas anteriores">
        {previousConversations.filter((c) => c.id !== conversation.id).length === 0 ? (
          <p className="text-[12px] text-cw-muted">Nenhuma outra conversa.</p>
        ) : (
          <ul className="space-y-1">
            {previousConversations
              .filter((c) => c.id !== conversation.id)
              .slice(0, 6)
              .map((previous) => (
                <li key={previous.id}>
                  <button
                    type="button"
                    onClick={() => onSelectConversation(previous.id)}
                    className={cx(
                      "w-full rounded-md px-2 py-1.5 text-left text-[12px] transition-colors duration-100 focus-ring",
                      "hover:bg-cw-surface dark:hover:bg-ink-800",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span
                        className={cx(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          previous.status === "resolved"
                            ? "bg-cw-surface text-cw-muted dark:bg-ink-800"
                            : "bg-green-100 text-green-700",
                        )}
                      >
                        {STATUS_LABELS[previous.status]}
                      </span>
                      <span className="shrink-0 text-[11px] text-cw-muted">
                        {relativeTime(previous.last_activity_at)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-cw-muted">
                      {previous.last_message?.content || "Sem mensagens"}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </PanelSection>
    </motion.aside>
  )
}
