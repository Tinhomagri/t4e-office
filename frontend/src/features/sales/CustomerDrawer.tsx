// Detalhe do cliente: dados cadastrais com autosave por campo, contatos e os
// negócios vinculados. Mesma casca do DealDrawer (full-screen no mobile).
import { AnimatePresence, motion } from "framer-motion"
import { Check, Loader2, Plus, Star, Trash2, X } from "lucide-react"
import { useEffect, useState } from "react"

import { settleSpring, springSmooth } from "@/shared/lib/motion"
import { Badge, Button, Field, Input, Select, Textarea, cx } from "@/shared/ui/primitives"

import {
  useContacts,
  useCreateContact,
  useDeals,
  useDeleteContact,
  useUpdateContact,
  useUpdateCustomer,
} from "./sales.hooks"
import { CUSTOMER_KIND_LABEL, dealAmount, formatMoney } from "./sales.shared"
import type { Customer, CustomerKind, UpdateCustomerInput } from "./sales.types"

export function CustomerDrawer({
  customer,
  workspaceId,
  onClose,
}: {
  customer: Customer
  workspaceId: string | null
  onClose: () => void
}) {
  const updateCustomer = useUpdateCustomer(workspaceId)
  const { data: deals } = useDeals(workspaceId, customer.id)
  const [draft, setDraft] = useState<Customer>(customer)
  const [savedHint, setSavedHint] = useState(false)

  useEffect(() => setDraft(customer), [customer])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const set = <K extends keyof Customer>(k: K, v: Customer[K]) =>
    setDraft((c) => ({ ...c, [k]: v }))

  const persist = async (patch: UpdateCustomerInput) => {
    await updateCustomer.mutateAsync({ customerId: customer.id, input: patch })
    setSavedHint(true)
    setTimeout(() => setSavedHint(false), 1500)
  }

  // Campo de texto simples com autosave no blur — evita repetir o par
  // onChange/onBlur em cada input do formulário.
  const textField = (key: keyof Customer & keyof UpdateCustomerInput, label: string, type = "text") => (
    <Field label={label}>
      <Input
        type={type}
        value={String(draft[key] ?? "")}
        onChange={(e) => set(key, e.target.value as Customer[typeof key])}
        onBlur={() => draft[key] !== customer[key] && persist({ [key]: draft[key] })}
      />
    </Field>
  )

  const customerDeals = deals ?? []
  const totalValue = customerDeals.reduce((acc, d) => acc + dealAmount(d), 0)

  return (
    <div className="fixed inset-0 z-50 flex justify-center p-0 sm:p-4">
      <motion.div
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      />

      <motion.div
        role="dialog"
        aria-label={`Cliente ${customer.name}`}
        initial={{ opacity: 0, x: 48, scale: 0.985 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 48, scale: 0.985 }}
        transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.9 }}
        className="relative z-10 flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-none border-paper-200 bg-white text-ink shadow-xl will-change-transform dark:border-ink-700 dark:bg-ink-900 dark:text-paper sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:border"
      >
        <div className="flex items-center justify-between gap-3 border-b border-paper-200 px-4 py-2.5 dark:border-ink-700">
          <div className="flex min-w-0 items-center gap-2">
            <Badge tone="brand" className="rounded-full">
              {CUSTOMER_KIND_LABEL[draft.kind]}
            </Badge>
            <AnimatePresence>
              {savedHint && (
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={springSmooth}
                  className="flex items-center gap-1 text-xs font-medium text-success"
                >
                  <Check className="size-3" /> salvo
                </motion.span>
              )}
            </AnimatePresence>
            {updateCustomer.isPending && (
              <Loader2 className="size-3.5 animate-spin text-paper-400" />
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar detalhe do cliente"
            className="grid size-11 shrink-0 place-items-center rounded-lg text-paper-400 transition-colors hover:bg-paper-100 hover:text-ink dark:hover:bg-ink-800 dark:hover:text-paper sm:size-8"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4 scrollbar-slim sm:p-5">
          <input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            onBlur={() => draft.name !== customer.name && persist({ name: draft.name })}
            aria-label="Nome do cliente"
            className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-xl font-semibold text-ink outline-none transition-colors hover:bg-paper-50 focus:border-brand-300 dark:text-paper dark:hover:bg-ink-800"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              <Select
                value={draft.kind}
                onChange={(e) => {
                  const kind = e.target.value as CustomerKind
                  set("kind", kind)
                  void persist({ kind })
                }}
              >
                <option value="company">Empresa</option>
                <option value="person">Pessoa física</option>
              </Select>
            </Field>
            {textField("document", draft.kind === "company" ? "CNPJ" : "CPF")}
            {draft.kind === "company" && textField("legal_name", "Razão social")}
            {textField("email", "E-mail", "email")}
            {textField("phone", "Telefone", "tel")}
            {textField("website", "Site", "url")}
          </div>

          <Field label="Observações">
            <Textarea
              rows={3}
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              onBlur={() => draft.notes !== customer.notes && persist({ notes: draft.notes })}
            />
          </Field>

          <ContactsSection customerId={customer.id} />

          {/* Negócios do cliente */}
          <section>
            <h3 className="mb-2 flex items-baseline justify-between text-sm font-semibold text-ink dark:text-paper">
              <span>Negócios</span>
              <span className="text-xs font-normal tabular text-paper-500">
                {customerDeals.length} · {formatMoney(totalValue)}
              </span>
            </h3>
            {customerDeals.length === 0 ? (
              <p className="text-sm text-paper-400">Nenhum negócio vinculado a este cliente.</p>
            ) : (
              <ul className="space-y-1.5">
                {customerDeals.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-paper-200 px-3 py-2 text-sm dark:border-ink-700"
                  >
                    <span className="min-w-0 truncate">{d.title}</span>
                    <span className="shrink-0 font-semibold tabular">
                      {formatMoney(dealAmount(d), d.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Contatos ────────────────────────────────────────────────────────────────

function ContactsSection({ customerId }: { customerId: string }) {
  const { data: contacts } = useContacts(customerId)
  const createContact = useCreateContact(customerId)
  const updateContact = useUpdateContact(customerId)
  const deleteContact = useDeleteContact(customerId)

  const [name, setName] = useState("")
  const [role, setRole] = useState("")
  const [email, setEmail] = useState("")

  const add = async () => {
    if (!name.trim()) return
    await createContact.mutateAsync({ name: name.trim(), role: role.trim(), email: email.trim() })
    setName("")
    setRole("")
    setEmail("")
  }

  const list = contacts ?? []

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-ink dark:text-paper">Contatos</h3>

      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {list.map((c) => (
            <motion.li
              key={c.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={settleSpring}
              className="flex items-center gap-2 rounded-xl border border-paper-200 px-3 py-2 dark:border-ink-700"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink dark:text-paper">{c.name}</p>
                <p className="truncate text-[11px] text-paper-500">
                  {[c.role, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <button
                onClick={() =>
                  updateContact.mutate({ contactId: c.id, input: { is_primary: !c.is_primary } })
                }
                aria-pressed={c.is_primary}
                aria-label={c.is_primary ? "Remover contato principal" : "Definir como principal"}
                className={cx(
                  "grid size-11 shrink-0 place-items-center rounded-lg transition-colors sm:size-8",
                  c.is_primary
                    ? "text-warning"
                    : "text-paper-300 hover:bg-paper-100 hover:text-warning dark:hover:bg-ink-800",
                )}
              >
                <Star className="size-4" fill={c.is_primary ? "currentColor" : "none"} />
              </button>
              <button
                onClick={() => deleteContact.mutate(c.id)}
                aria-label={`Remover contato ${c.name}`}
                className="grid size-11 shrink-0 place-items-center rounded-lg text-paper-300 transition-colors hover:bg-danger/10 hover:text-danger sm:size-8"
              >
                <Trash2 className="size-4" />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" aria-label="Nome do contato" />
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Cargo" aria-label="Cargo do contato" />
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          aria-label="E-mail do contato"
        />
        <Button
          icon={<Plus className="size-4" />}
          onClick={add}
          loading={createContact.isPending}
          className="min-h-11"
        >
          Adicionar
        </Button>
      </div>
    </section>
  )
}
