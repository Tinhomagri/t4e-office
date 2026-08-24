// Aba "Geral" — identidade do projeto: avatar, nome, chave, categoria, lead.
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Check, Globe2, Lock, Trash2, Upload, Users } from "lucide-react"

import { useSquads } from "@/features/poker/poker.hooks"
import {
  useDeleteProject,
  useProject,
  useUpdateProject,
  useUpdateProjectAvatar,
} from "@/features/workspace/workspace.hooks"
import type { ProjectDetail } from "@/features/workspace/workspace.types"
import { Button, Field, Input, Select, Spinner, Textarea, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"
import { errMsg } from "../board.shared"

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
  const deleteProject = useDeleteProject()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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
    } catch (err) {
      const detail = (err as { response?: { data?: { error?: string } }; message?: string })
      const backendDetail = detail?.response?.data?.error
      toast.error(backendDetail ?? detail?.message ?? "Não foi possível enviar a imagem.")
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

      <AccessCard project={project} members={members} canEdit={canEdit} update={update} />

      <MuralNotificationsCard
        project={project}
        members={members}
        canEdit={canEdit}
        update={update}
      />

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

      {canEdit && (
        <SettingsCard
          title="Zona de perigo"
          description="Excluir o board apaga TODOS os cards, sprints, colunas e histórico dele — definitivo, sem desfazer."
        >
          <Button
            variant="danger"
            icon={<Trash2 className="size-3.5" />}
            onClick={() => setConfirmingDelete(true)}
          >
            Excluir board
          </Button>
        </SettingsCard>
      )}

      {confirmingDelete && (
        <DeleteProjectModal
          project={project}
          isDeleting={deleteProject.isPending}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            try {
              await deleteProject.mutateAsync(project.id)
              toast.success(`Board ${project.key} excluído`)
              navigate("/app/boards")
            } catch (err) {
              toast.error(errMsg(err))
            }
          }}
        />
      )}
    </div>
  )
}

function DeleteProjectModal({
  project,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  project: ProjectDetail
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const [confirmText, setConfirmText] = useState("")
  const canConfirm = confirmText.trim().toUpperCase() === project.key

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
        onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-paper-200 bg-white p-5 shadow-xl dark:border-ink-700 dark:bg-ink-800">
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink dark:text-paper">
          <Trash2 className="size-4 text-danger-500" />
          Excluir o board {project.key}?
        </h3>
        <p className="mt-2 text-sm text-paper-500">
          Apaga TODOS os cards, sprints, colunas e histórico. Definitivo. Pra
          confirmar, digite a chave{" "}
          <span className="font-semibold text-ink dark:text-paper">{project.key}</span>.
        </p>
        <input
          autoFocus
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
          placeholder={project.key}
          className="mt-3 w-full rounded-lg border border-paper-300 bg-paper px-3 py-2 text-sm outline-none focus:border-danger-400 dark:border-ink-700 dark:bg-ink-900"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={onConfirm}
            disabled={!canConfirm || isDeleting}
            loading={isDeleting}
          >
            Excluir board
          </Button>
        </div>
      </div>
    </div>
  )
}

// Squad dona + visibilidade — a mesma coisa que a criação de board já pede,
// só que aqui edita um projeto que já existe. Sem isto, só dava pra declarar
function MuralNotificationsCard({
  project,
  members,
  canEdit,
  update,
}: {
  project: ProjectDetail
  members: Member[]
  canEdit: boolean
  update: ReturnType<typeof useUpdateProject>
}) {
  const excluded = new Set(project.mural_notification_excluded_user_ids)

  const toggle = (userId: string) => {
    const next = new Set(excluded)
    if (next.has(userId)) next.delete(userId)
    else next.add(userId)
    update.mutate(
      { mural_notification_excluded_user_ids: Array.from(next) },
      { onError: () => toast.error("Não foi possível salvar quem recebe notificação do mural.") },
    )
  }

  return (
    <SettingsCard
      title="Notificações do mural"
      description="Quem recebe bipe e notificação quando o cliente escreve no mural deste board. Todo mundo recebe por padrão — desmarque quem não precisa."
    >
      <div className="grid gap-1.5 sm:grid-cols-2">
        {members.map((m) => (
          <label
            key={m.user_id}
            className="flex items-center gap-2 rounded-lg border border-paper-200 p-2 text-[13px] dark:border-ink-700"
          >
            <input
              type="checkbox"
              checked={!excluded.has(m.user_id)}
              disabled={!canEdit}
              onChange={() => toggle(m.user_id)}
              className="size-3.5 accent-brand-600"
            />
            {m.name}
          </label>
        ))}
      </div>
    </SettingsCard>
  )
}

function AccessCard({
  project,
  members,
  canEdit,
  update,
}: {
  project: ProjectDetail
  members: Member[]
  canEdit: boolean
  update: ReturnType<typeof useUpdateProject>
}) {
  const { data: squads = [] } = useSquads(project.workspace_id)

  const setVisibility = (visibility: "restricted" | "workspace") => {
    if (visibility === project.visibility) return
    update.mutate(
      { visibility },
      { onError: () => toast.error("Não foi possível mudar a visibilidade.") },
    )
  }

  const setSquad = (squadId: string) => {
    update.mutate(
      { squad_id: squadId || null },
      { onError: () => toast.error("Não foi possível mudar a squad dona.") },
    )
  }

  const selectedUsers = new Set(project.access_user_ids ?? [])
  const toggleUser = (userId: string) => {
    const next = new Set(selectedUsers)
    if (next.has(userId)) next.delete(userId)
    else next.add(userId)
    update.mutate(
      { access_user_ids: [...next] },
      { onError: () => toast.error("Não foi possível atualizar as pessoas com acesso.") },
    )
  }

  return (
    <SettingsCard
      title="Acesso ao board"
      description="Combine uma squad, pessoas escolhidas ou abra para todo o workspace."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Visibilidade">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setVisibility("restricted")}
              className={cx(
                "flex items-center gap-2 rounded-lg border p-2.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                project.visibility === "restricted"
                  ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                  : "border-paper-200 dark:border-ink-700 hover:border-brand-300",
              )}
            >
              <Lock className="size-3.5 shrink-0" />
              Restrito
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setVisibility("workspace")}
              className={cx(
                "flex items-center gap-2 rounded-lg border p-2.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                project.visibility === "workspace"
                  ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                  : "border-paper-200 dark:border-ink-700 hover:border-brand-300",
              )}
            >
              <Globe2 className="size-3.5 shrink-0" />
              Workspace
            </button>
          </div>
        </Field>
        <Field label="Squad com acesso" hint="Opcional — toda a squad ganha acesso.">
          <Select
            value={project.squad_id ?? ""}
            disabled={!canEdit || project.visibility === "workspace"}
            onChange={(e) => setSquad(e.target.value)}
          >
            <option value="">Nenhuma</option>
            {squads.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4 border-t border-paper-200 pt-3 dark:border-ink-800">
        <div className="mb-2 flex items-center gap-2">
          <Users className="size-3.5 text-brand-500" />
          <p className="text-[13px] font-medium text-ink dark:text-paper">Pessoas com acesso direto</p>
          <span className="text-[11px] text-paper-500">{selectedUsers.size} selecionada{selectedUsers.size === 1 ? "" : "s"}</span>
        </div>
        <div className="grid max-h-44 gap-1.5 overflow-y-auto sm:grid-cols-2">
          {members.map((member) => {
            const selected = selectedUsers.has(member.user_id)
            return (
              <button
                key={member.user_id}
                type="button"
                disabled={!canEdit || project.visibility === "workspace"}
                onClick={() => toggleUser(member.user_id)}
                className={cx(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                  selected
                    ? "border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/50 dark:bg-brand-500/15 dark:text-brand-300"
                    : "border-paper-200 text-paper-600 hover:border-brand-300 dark:border-ink-700 dark:text-ink-200 dark:hover:border-brand-500/50",
                  (!canEdit || project.visibility === "workspace") && "cursor-not-allowed opacity-50",
                )}
              >
                <span className={cx("grid size-5 place-items-center rounded-md border", selected ? "border-brand-500 bg-brand-500 text-white" : "border-paper-300 dark:border-ink-600")}>
                  {selected && <Check className="size-3" />}
                </span>
                <span className="min-w-0 truncate">{member.name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </SettingsCard>
  )
}
