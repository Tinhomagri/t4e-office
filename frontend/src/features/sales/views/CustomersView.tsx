// Lista de clientes com busca e criação. No mobile vira lista de cartões
// (tabela quebraria o layout); a partir de sm+ vira tabela de leitura rápida.
import { AnimatePresence, motion } from "framer-motion"
import { Building2, Mail, Phone, Plus, Search, User } from "lucide-react"
import { useMemo, useState } from "react"

import { fadeUpItem, staggerContainer } from "@/shared/lib/motion"
import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  cx,
} from "@/shared/ui/primitives"

import { CustomerDrawer } from "../CustomerDrawer"
import { useCreateCustomer, useCustomers } from "../sales.hooks"
import { CUSTOMER_KIND_LABEL } from "../sales.shared"
import type { Customer, CustomerKind } from "../sales.types"

export function CustomersView({ workspaceId }: { workspaceId: string | null }) {
  const { data: customers, isLoading } = useCustomers(workspaceId)
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState<Customer | null>(null)
  const [creating, setCreating] = useState(false)

  // Busca local: a lista de clientes de um workspace cabe em memória e o filtro
  // instantâneo evita um round-trip por tecla.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = customers ?? []
    if (!q) return list
    return list.filter((c) =>
      [c.name, c.legal_name, c.document, c.email].some((v) => v?.toLowerCase().includes(q)),
    )
  }, [customers, search])

  const current = open ? ((customers ?? []).find((c) => c.id === open.id) ?? open) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-paper-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, documento ou e-mail…"
            aria-label="Buscar clientes"
            className="min-h-11 pl-9"
          />
        </div>
        <Button
          icon={<Plus className="size-4" />}
          onClick={() => setCreating(true)}
          className="min-h-11"
        >
          Novo cliente
        </Button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-20">
          <Spinner className="size-6" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-6" />}
          title={search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
          description={
            search
              ? "Ajuste a busca ou cadastre um novo cliente."
              : "Cadastre o primeiro cliente para começar a registrar negócios."
          }
          action={
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Novo cliente
            </Button>
          }
        />
      ) : (
        <motion.ul
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3"
        >
          {filtered.map((c) => (
            <motion.li key={c.id} variants={fadeUpItem}>
              <button
                onClick={() => setOpen(c)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-2xl border border-paper-200 bg-paper px-4 py-3 text-left dark:border-ink-700 dark:bg-ink-900",
                  "transition-[transform,box-shadow,border-color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  "hover:-translate-y-0.5 hover:border-paper-300 hover:shadow-panel focus-ring",
                )}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper-100 text-paper-500 dark:bg-ink-800">
                  {c.kind === "company" ? (
                    <Building2 className="size-5" />
                  ) : (
                    <User className="size-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink dark:text-paper">
                    {c.name}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-paper-500">
                    <span>{CUSTOMER_KIND_LABEL[c.kind]}</span>
                    {c.email && (
                      <span className="flex min-w-0 items-center gap-1">
                        <Mail className="size-3 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </span>
                    )}
                    {c.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" />
                        {c.phone}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </motion.li>
          ))}
        </motion.ul>
      )}

      {creating && (
        <CreateCustomerModal workspaceId={workspaceId} onClose={() => setCreating(false)} />
      )}

      <AnimatePresence>
        {current && (
          <CustomerDrawer
            key={current.id}
            customer={current}
            workspaceId={workspaceId}
            onClose={() => setOpen(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function CreateCustomerModal({
  workspaceId,
  onClose,
}: {
  workspaceId: string | null
  onClose: () => void
}) {
  const createCustomer = useCreateCustomer(workspaceId)
  const [kind, setKind] = useState<CustomerKind>("company")
  const [name, setName] = useState("")
  const [document, setDocument] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) {
      setError("Informe o nome do cliente.")
      return
    }
    await createCustomer.mutateAsync({ kind, name: name.trim(), document, email })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Novo cliente"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={createCustomer.isPending}>
            Cadastrar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as CustomerKind)}>
            <option value="company">Empresa</option>
            <option value="person">Pessoa física</option>
          </Select>
        </Field>
        <Field label={kind === "company" ? "Nome fantasia" : "Nome completo"}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label={kind === "company" ? "CNPJ" : "CPF"}>
          <Input value={document} onChange={(e) => setDocument(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="E-mail">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
