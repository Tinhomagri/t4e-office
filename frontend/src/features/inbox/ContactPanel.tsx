// Painel direito: quem é o contato e a que negócio essa conversa pertence.
//
// A metade de cima replica o painel do Chatwoot (dados do contato, atributos,
// conversas anteriores). A metade de baixo é nossa: o vínculo com o funil, que
// é o motivo de o atendimento morar dentro do Comercial.
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
import { Badge, Button, SectionLabel, Select, cx } from "@/shared/ui/primitives"

import { initials, relativeTime, STATUS_LABELS } from "./inbox.shared"
import type { ChatContact, Conversation } from "./inbox.types"

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

  // Atributos personalizados do contato definidos no Chatwoot pelo admin.
  const customEntries = Object.entries(contact?.custom_attributes ?? {}).filter(
    ([, value]) => value !== null && value !== "" && value !== undefined,
  )

  return (
    <aside className="flex w-full flex-col gap-4 overflow-y-auto border-l border-paper-300 bg-paper p-4 dark:border-ink-800 dark:bg-ink-900 lg:w-[300px] lg:shrink-0">
      {/* Identidade */}
      <div className="flex flex-col items-center text-center">
        {avatar ? (
          <img src={avatar} alt="" className="size-16 rounded-full object-cover" />
        ) : (
          <span className="grid size-16 place-items-center rounded-full bg-paper-200 text-lg font-semibold text-paper-700 dark:bg-ink-700 dark:text-paper-300">
            {initials(name)}
          </span>
        )}
        <h3 className="mt-2 text-sm font-semibold text-ink dark:text-paper">{name}</h3>
        {contact?.company_name && (
          <p className="text-[12px] text-paper-600">{contact.company_name}</p>
        )}
        {contact?.availability_status === "online" && (
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-success">
            <span className="size-1.5 rounded-full bg-success" /> Online
          </span>
        )}
      </div>

      {/* Contato */}
      <section className="space-y-1.5">
        <SectionLabel>Contato</SectionLabel>
        <ul className="space-y-1 text-[12px]">
          {email && (
            <li className="flex items-center gap-2 text-paper-700 dark:text-paper-300">
              <AtSign className="size-3.5 shrink-0 text-paper-500" />
              <a href={`mailto:${email}`} className="truncate hover:underline">
                {email}
              </a>
            </li>
          )}
          {phone && (
            <li className="flex items-center gap-2 text-paper-700 dark:text-paper-300">
              <Phone className="size-3.5 shrink-0 text-paper-500" />
              <a href={`tel:${phone}`} className="truncate hover:underline">
                {phone}
              </a>
            </li>
          )}
          {contact?.city && (
            <li className="flex items-center gap-2 text-paper-700 dark:text-paper-300">
              <MapPin className="size-3.5 shrink-0 text-paper-500" />
              <span className="truncate">
                {contact.city}
                {contact.country && `, ${contact.country}`}
              </span>
            </li>
          )}
          {conversation.channel && (
            <li className="flex items-center gap-2 text-paper-700 dark:text-paper-300">
              <Globe className="size-3.5 shrink-0 text-paper-500" />
              <span className="truncate">{conversation.channel.replace("Channel::", "")}</span>
            </li>
          )}
          {!email && !phone && !contact?.city && (
            <li className="text-paper-500">Sem dados de contato.</li>
          )}
        </ul>
      </section>

      {/* Atributos personalizados vindos do Chatwoot */}
      {customEntries.length > 0 && (
        <section className="space-y-1.5">
          <SectionLabel>Atributos</SectionLabel>
          <dl className="space-y-1 text-[12px]">
            {customEntries.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-2">
                <dt className="truncate text-paper-500">{key}</dt>
                <dd className="truncate font-medium text-ink dark:text-paper">
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Ponte com o funil — a parte que o Chatwoot não tem */}
      <section className="space-y-2 rounded-xl border border-paper-300 p-3 dark:border-ink-800">
        <SectionLabel>Negócio no funil</SectionLabel>

        {linked ? (
          <div className="space-y-2">
            {conversation.link.deal_title && (
              <p className="flex items-start gap-2 text-[13px] font-medium text-ink dark:text-paper">
                <Target className="mt-0.5 size-3.5 shrink-0 text-brand-500" />
                <span className="min-w-0 break-words">{conversation.link.deal_title}</span>
              </p>
            )}
            {conversation.link.customer_name && (
              <p className="flex items-center gap-2 text-[12px] text-paper-600">
                <Building2 className="size-3.5 shrink-0" />
                <span className="truncate">{conversation.link.customer_name}</span>
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              icon={<Link2Off className="size-3.5" />}
              onClick={onUnlink}
              loading={linking}
            >
              Desvincular
            </Button>
          </div>
        ) : pickerOpen ? (
          <div className="space-y-2">
            <Select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value)
                setDealId("")
              }}
              aria-label="Cliente"
            >
              <option value="">Escolha o cliente…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>

            {customerId && (
              <Select
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                aria-label="Negócio"
              >
                <option value="">Só o cliente (sem negócio)</option>
                {deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.title}
                  </option>
                ))}
              </Select>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={!customerId}
                loading={linking}
                onClick={() => {
                  onLink({
                    deal_id: dealId || null,
                    customer_id: customerId || null,
                  })
                  setPickerOpen(false)
                }}
              >
                Vincular
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPickerOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[12px] text-paper-600">
              Esta conversa ainda não está ligada a nenhum negócio.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              icon={<Link2 className="size-3.5" />}
              onClick={() => setPickerOpen(true)}
            >
              Vincular ao funil
            </Button>
          </>
        )}
      </section>

      {/* Histórico do mesmo contato */}
      <section className="space-y-1.5">
        <SectionLabel>Conversas anteriores</SectionLabel>
        {previousConversations.length === 0 ? (
          <p className="text-[12px] text-paper-500">Nenhuma outra conversa.</p>
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
                      "w-full rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors duration-150 focus-ring",
                      "hover:bg-paper-100 dark:hover:bg-ink-800",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <Badge tone={previous.status === "resolved" ? "neutral" : "success"}>
                        {STATUS_LABELS[previous.status]}
                      </Badge>
                      <span className="shrink-0 text-[11px] text-paper-500">
                        {relativeTime(previous.last_activity_at)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-paper-600">
                      {previous.last_message?.content || "Sem mensagens"}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
