// Central de Solicitações: qualquer pessoa do workspace pede uma peça/campanha
// por um formulário; o pedido entra como card na coluna "Briefing" (label
// "solicitação") para o time de marketing triar.
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useCreateCard } from "@/features/workspace/workspace.hooks"
import type { CardType } from "@/features/workspace/workspace.types"
import { Button, Field, Input, Modal, Select, Textarea } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"
import { CHANNEL_LABEL } from "./CalendarioView"

const REQUEST_TYPES: { value: CardType; label: string }[] = [
  { value: "post", label: "Post de rede social" },
  { value: "peca", label: "Peça / arte" },
  { value: "campanha", label: "Campanha" },
  { value: "artigo", label: "Artigo / blog" },
  { value: "email", label: "E-mail / newsletter" },
]

const CHANNELS = Object.keys(CHANNEL_LABEL)

export function RequestDialog({
  open,
  onClose,
  projectId,
}: {
  open: boolean
  onClose: () => void
  projectId: string
}) {
  const qc = useQueryClient()
  const createCard = useCreateCard(projectId)

  const [type, setType] = useState<CardType>("post")
  const [channel, setChannel] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [title, setTitle] = useState("")
  const [briefing, setBriefing] = useState("")

  const submit = async () => {
    if (!title.trim()) return
    try {
      await createCard.mutateAsync({
        title: title.trim(),
        description: briefing.trim(),
        type,
        status: "briefing",
        channel: channel || undefined,
        due_date: dueDate || null,
        labels: ["solicitação"],
      })
      qc.invalidateQueries({ queryKey: ["marketing-report", projectId] })
      toast.success("Solicitação enviada ao time de marketing")
      onClose()
      setTitle("")
      setBriefing("")
      setChannel("")
      setDueDate("")
    } catch {
      toast.error("Falha ao enviar a solicitação.")
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Nova solicitação"
      description="Peça uma peça, arte ou campanha ao time de marketing."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={createCard.isPending} disabled={!title.trim()}>
            Enviar pedido
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="O que você precisa?">
          <Select value={type} onChange={(e) => setType(e.target.value as CardType)}>
            {REQUEST_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Canal (opcional)">
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">—</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prazo desejado">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Título do pedido">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Post de aniversário da empresa"
          />
        </Field>

        <Field label="Briefing" hint="Detalhe o objetivo, referências, texto obrigatório, etc.">
          <Textarea
            rows={4}
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            placeholder="Explique o que precisa"
          />
        </Field>
      </div>
    </Modal>
  )
}
