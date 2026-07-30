// Aba "Geral" — identidade do projeto: avatar, nome, chave, categoria, lead.
import { useEffect, useRef, useState } from "react"
import { Trash2, Upload } from "lucide-react"

import {
  useProject,
  useUpdateProject,
  useUpdateProjectAvatar,
} from "@/features/workspace/workspace.hooks"
import type { ProjectDetail } from "@/features/workspace/workspace.types"
import { Button, Field, Input, Select, Spinner, Textarea } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

import { ColorPicker, SettingsCard } from "./board-settings.shared"

// Emojis oferecidos como avatar. Um teclado de emoji completo seria ruído: essas
// categorias cobrem os tipos de projeto que a plataforma tem hoje.
const EMOJIS = [
  "📋", "🚀", "🎯", "💡", "🛠️", "📊", "🏥", "🎨",
  "📣", "💼", "🧪", "🔒", "🌱", "⚡", "📦", "🧭",
]

interface Member {
  user_id: string
  name: string
}

export function GeneralTab({
  projectId,
  members,
  canEdit,
}: {
  projectId: string
  members: Member[]
  canEdit: boolean
}) {
  const { data: project, isLoading } = useProject(projectId)
  const update = useUpdateProject(projectId)
  const updateAvatar = useUpdateProjectAvatar(projectId)
  const fileRef = useRef<HTMLInputElement>(null)

  // Form local: só envia no submit, para o usuário poder desistir da edição.
  const [form, setForm] = useState<Partial<ProjectDetail>>({})

  useEffect(() => {
    if (project) setForm(project)
  }, [project])

  if (isLoading || !project) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner className="size-6" />
      </div>
    )
  }

  const set = <K extends keyof ProjectDetail>(key: K, value: ProjectDetail[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // Compara com o servidor para não mandar PATCH sem mudança nenhuma.
  const dirty = (
    ["name", "key", "description", "category", "avatar_emoji", "avatar_color",
     "lead_id", "default_assignee_id"] as const
  ).some((k) => (form[k] ?? "") !== (project[k] ?? ""))

  async function handleSave() {
    try {
      await update.mutateAsync({
        name: form.name,
        key: form.key,
        description: form.description,
        category: form.category,
        avatar_emoji: form.avatar_emoji,
        avatar_color: form.avatar_color,
        lead_id: form.lead_id || null,
        default_assignee_id: form.default_assignee_id || null,
      })
      toast.success("Projeto atualizado.")
    } catch (err) {
      // O backend valida chave duplicada/vazia — mostra a mensagem dele.
      const detail = (err as { response?: { data?: { error?: string } } })?.response?.data
        ?.error
      toast.error(detail ?? "Não foi possível salvar o projeto.")
    }
  }

  async function handleUpload(file: File | null) {
    try {
      await updateAvatar.mutateAsync(file)
      toast.success(file ? "Imagem atualizada." : "Imagem removida.")
    } catch {
      toast.error("Não foi possível enviar a imagem.")
    }
  }

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Avatar"
        description="Enviar uma imagem substitui o emoji. Remova a imagem para voltar ao emoji."
      >
        <div className="flex flex-wrap items-start gap-5">
          <div className="flex flex-col items-center gap-2">
            <div
              className="grid size-16 place-items-center overflow-hidden rounded-xl text-3xl"
              style={{
                backgroundColor: project.avatar_url ? undefined : form.avatar_color,
              }}
            >
              {project.avatar_url ? (
                <img
                  src={project.avatar_url}
                  alt={`Avatar de ${project.name}`}
                  className="size-full object-cover"
                />
              ) : (
                <span>{form.avatar_emoji || project.key.slice(0, 2)}</span>
              )}
            </div>
            {canEdit && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Upload className="size-3.5" />}
                  loading={updateAvatar.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  Enviar
                </Button>
                {project.avatar_url && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="size-3.5" />}
                    onClick={() => handleUpload(null)}
                  >
                    Remover
                  </Button>
                )}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                if (file) handleUpload(file)
                e.target.value = ""
              }}
            />
          </div>

          <div className="min-w-[240px] flex-1 space-y-3">
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink dark:text-paper">Emoji</p>
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={form.avatar_emoji === emoji}
                    onClick={() => set("avatar_emoji", emoji)}
                    className={`grid size-8 place-items-center rounded-lg text-lg transition-colors focus-ring ${
                      form.avatar_emoji === emoji
                        ? "bg-brand-50 ring-2 ring-brand-500"
                        : "hover:bg-paper-100 dark:hover:bg-ink-800"
                    } ${canEdit ? "" : "cursor-not-allowed opacity-50"}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink dark:text-paper">
                Cor de fundo
              </p>
              <ColorPicker
                value={form.avatar_color ?? "#8270DB"}
                onChange={(c) => set("avatar_color", c)}
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Detalhes" description="Nome, chave e responsáveis do projeto.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome">
            <Input
              value={form.name ?? ""}
              disabled={!canEdit}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Chave" hint="Prefixo dos cards (ex.: VAL-142). Único no workspace.">
            <Input
              value={form.key ?? ""}
              disabled={!canEdit}
              maxLength={10}
              onChange={(e) => set("key", e.target.value.toUpperCase())}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descrição">
              <Textarea
                rows={3}
                value={form.description ?? ""}
                disabled={!canEdit}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Categoria" hint="Usada para agrupar projetos no portfólio.">
            <Input
              value={form.category ?? ""}
              disabled={!canEdit}
              placeholder="Ex.: Saúde, Interno, Cliente"
              onChange={(e) => set("category", e.target.value)}
            />
          </Field>
          <Field label="Líder do projeto">
            <Select
              value={form.lead_id ?? ""}
              disabled={!canEdit}
              onChange={(e) => set("lead_id", e.target.value || null)}
            >
              <option value="">Ninguém</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável padrão" hint="Aplicado a cards criados sem responsável.">
            <Select
              value={form.default_assignee_id ?? ""}
              disabled={!canEdit}
              onChange={(e) => set("default_assignee_id", e.target.value || null)}
            >
              <option value="">Não atribuído</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {canEdit && (
          <div className="mt-4 flex justify-end gap-2 border-t border-paper-200 pt-3 dark:border-ink-800">
            <Button variant="ghost" disabled={!dirty} onClick={() => setForm(project)}>
              Descartar
            </Button>
            <Button loading={update.isPending} disabled={!dirty} onClick={handleSave}>
              Salvar
            </Button>
          </div>
        )}
      </SettingsCard>
    </div>
  )
}
