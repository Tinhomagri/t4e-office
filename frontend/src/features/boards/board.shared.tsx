// Constantes e helpers visuais compartilhados entre BoardsPage e KanbanView.
import { AvatarCanvas } from "@/features/avatar/AvatarCanvas"
import { useAvatarsBatch } from "@/features/office/office.hooks"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { cx } from "@/shared/ui/primitives"
import type { CardPriority, CardStatus, CardType } from "@/features/workspace/workspace.types"

export const STATUS_LABEL: Record<CardStatus, string> = {
  backlog: "Backlog",
  todo: "A fazer",
  doing: "Em andamento",
  review: "Em revisão",
  done: "Concluído",
  briefing: "Briefing",
  criacao: "Criação",
  aprovacao: "Aprovação",
  agendado: "Agendado",
  publicado: "Publicado",
}

export const STATUS_DOT: Record<CardStatus, string> = {
  backlog: "bg-slate-400",
  todo: "bg-indigo-500",
  doing: "bg-amber-500",
  review: "bg-purple-500",
  done: "bg-green-500",
  briefing: "bg-violet-500",
  criacao: "bg-blue-500",
  aprovacao: "bg-amber-500",
  agendado: "bg-cyan-500",
  publicado: "bg-green-500",
}

export const TYPE_LABEL: Record<CardType, string> = {
  feature: "História",
  bug: "Bug",
  debt: "Débito",
  spike: "Spike",
  chore: "Tarefa",
  epic: "Epic",
  post: "Post",
  peca: "Peça",
  campanha: "Campanha",
  artigo: "Artigo",
  email: "E-mail",
}

export const TYPE_COLOR: Record<CardType, string> = {
  feature: "bg-brand-100 text-brand-700",
  bug: "bg-red-100 text-red-700",
  debt: "bg-orange-100 text-orange-700",
  spike: "bg-cyan-100 text-cyan-700",
  chore: "bg-paper-200 dark:bg-ink-700 text-paper-600",
  epic: "bg-violet-100 text-violet-700",
  post: "bg-brand-100 text-brand-700",
  peca: "bg-paper-200 dark:bg-ink-700 text-paper-600",
  campanha: "bg-violet-100 text-violet-700",
  artigo: "bg-orange-100 text-orange-700",
  email: "bg-amber-100 text-amber-700",
}

export const PRIORITY_LABEL: Record<CardPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
}

export const PRIORITY_BAR: Record<CardPriority, string> = {
  low: "bg-paper-300",
  medium: "bg-brand-400",
  high: "bg-warning",
  urgent: "bg-danger",
}

// Avatar colors — determinístico por nome
const AVATAR_GRADIENTS = [
  "from-violet-500 to-purple-700",
  "from-blue-500 to-indigo-700",
  "from-emerald-500 to-teal-700",
  "from-rose-500 to-pink-700",
  "from-amber-500 to-orange-700",
  "from-cyan-500 to-sky-700",
  "from-fuchsia-500 to-pink-700",
  "from-lime-500 to-green-700",
]

export function avatarGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

// Cor determinística de label (estilo Jira) — bg/texto a partir do nome.
const LABEL_COLORS = [
  "bg-blue-50 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-orange-100 text-orange-700",
  "bg-violet-100 text-violet-700",
  "bg-red-100 text-red-700",
  "bg-cyan-100 text-cyan-700",
  "bg-yellow-100 text-yellow-700",
]

export function labelColor(label: string): string {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) & 0xffff
  return LABEL_COLORS[hash % LABEL_COLORS.length]
}

// Estado do prazo: vencido / próximo (≤2 dias) / normal.
export type DueState = { tone: string; label: string; overdue: boolean }

export function dueState(due: string | null): DueState | null {
  if (!due) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(due + "T00:00:00")
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  if (diffDays < 0) return { tone: "bg-red-100 text-red-700", label, overdue: true }
  if (diffDays <= 2) return { tone: "bg-orange-100 text-orange-700", label, overdue: false }
  return { tone: "bg-paper-100 text-paper-500", label, overdue: false }
}

// Iniciais coloridas por padrão; se `userId` tiver um personagem configurado
// no Escritório, mostra ele no lugar — é a "foto" da pessoa no app inteiro,
// não só lá no jogo. `userId` é opcional pra não quebrar quem só tem o nome
// à mão (import antigo, autor de comentário externo, etc.).
export function ColoredAvatar({
  name,
  userId,
  size = "sm",
}: {
  name: string
  userId?: string | null
  size?: "xs" | "sm"
}) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { data: avatars } = useAvatarsBatch(workspaceId, userId ? [userId] : [])
  const config = userId ? avatars?.[userId] : undefined
  const dim = size === "xs" ? "size-5" : "size-6"

  if (config) {
    return (
      <span
        title={name}
        className={cx(
          // items-start (não center): o sprite é 16x32 (retrato inteiro),
          // centralizar verticalmente cortaria a cabeça — alinhar no topo
          // deixa o rosto dentro do círculo em vez do torso.
          "grid shrink-0 justify-items-center overflow-hidden rounded-full bg-ink-800 ring-1 ring-inset ring-white/20 shadow-sm",
          dim,
        )}
        style={{ alignContent: "start" }}
      >
        <AvatarCanvas config={config} anim="idle" dir="down" frozen scale={1} />
      </span>
    )
  }

  const init = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
  const grad = avatarGradient(name)
  return (
    <span
      title={name}
      className={cx(
        "grid place-items-center rounded-full bg-gradient-to-br font-semibold text-white ring-1 ring-inset ring-white/20 shadow-sm",
        grad,
        size === "xs" ? "size-5 text-[8px]" : "size-6 text-[9px]",
      )}
    >
      {init}
    </span>
  )
}

export function InitialsDot({ name, size = "sm" }: { name: string; size?: "xs" | "sm" }) {
  const init = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
  const grad = avatarGradient(name)
  return (
    <span
      className={cx(
        "grid place-items-center rounded-full bg-gradient-to-br font-semibold text-white ring-1 ring-inset ring-white/20",
        grad,
        size === "xs" ? "size-4 text-[8px]" : "size-6 text-[9px]",
      )}
    >
      {init}
    </span>
  )
}

export function errMsg(e: unknown): string {
  const anyE = e as { response?: { data?: { error?: string; detail?: string } } }
  return (
    anyE?.response?.data?.error ??
    anyE?.response?.data?.detail ??
    "Não foi possível concluir."
  )
}
