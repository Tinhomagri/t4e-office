// Abas "Swimlanes", "Layout do card" e "Cores de card" — tudo persistido em
// BoardConfig, então compartilham a mesma query/mutation.
import { useBoardConfig, useUpdateBoardConfig } from "@/features/workspace/workspace.hooks"
import type {
  BoardConfig,
  CardColorRule,
  CardFieldKey,
  SwimlaneMode,
  UpdateBoardConfigInput,
} from "@/features/workspace/workspace.types"
import { Input, Select, Spinner } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

import { ColorPicker, SettingRow, SettingsCard, Toggle } from "./board-settings.shared"

const SWIMLANE_LABEL: Record<SwimlaneMode, string> = {
  none: "Sem agrupamento",
  epic: "Epic",
  assignee: "Responsável",
  priority: "Prioridade",
  subtask: "Subtarefa",
}

const CARD_COLOR_LABEL: Record<CardColorRule, string> = {
  none: "Sem cor",
  priority: "Prioridade",
  issue_type: "Tipo do ticket",
  assignee: "Responsável",
  epic: "Epic",
}

const FIELD_LABEL: Record<CardFieldKey, string> = {
  key: "Chave do ticket",
  issue_type: "Tipo do ticket",
  priority: "Prioridade",
  assignee: "Responsável",
  labels: "Categorias",
  epic: "Epic",
  due_date: "Data limite",
  start_date: "Data de início",
  story_points: "Estimativa (story points)",
  status: "Status",
  reporter: "Relator",
  subtask_progress: "Progresso de subtarefas",
  created_at: "Criado em",
  updated_at: "Atualizado em",
  cover_image: "Capa do cartão",
}

// Valores que a regra de cor pode assumir, para montar o mapa valor→cor.
// Regras baseadas em pessoas/epics têm domínio dinâmico e usam cor automática.
const COLOR_RULE_VALUES: Partial<Record<CardColorRule, { key: string; label: string }[]>> = {
  priority: [
    { key: "urgent", label: "Urgente" },
    { key: "high", label: "Alta" },
    { key: "medium", label: "Média" },
    { key: "low", label: "Baixa" },
  ],
  issue_type: [
    { key: "task", label: "Tarefa" },
    { key: "bug", label: "Bug" },
    { key: "story", label: "História" },
    { key: "epic", label: "Epic" },
  ],
}

export function BoardTab({
  projectId,
  canEdit,
}: {
  projectId: string
  canEdit: boolean
}) {
  const { data: config, isLoading } = useBoardConfig(projectId)
  const update = useUpdateBoardConfig(projectId)

  if (isLoading || !config) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner className="size-6" />
      </div>
    )
  }

  const save = (input: UpdateBoardConfigInput) =>
    update.mutate(input, {
      onError: () => toast.error("Não foi possível salvar a configuração."),
    })

  return (
    <div className="space-y-4">
      <SwimlanesCard config={config} canEdit={canEdit} onSave={save} />
      <CardLayoutCard config={config} canEdit={canEdit} onSave={save} />
      <CardColorsCard config={config} canEdit={canEdit} onSave={save} />
      <FeaturesCard config={config} canEdit={canEdit} onSave={save} />
    </div>
  )
}

interface TabProps {
  config: BoardConfig
  canEdit: boolean
  onSave: (input: UpdateBoardConfigInput) => void
}

function SwimlanesCard({ config, canEdit, onSave }: TabProps) {
  return (
    <SettingsCard
      title="Swimlanes"
      description="Agrupa os cards em faixas horizontais dentro de cada coluna."
    >
      <SettingRow label="Agrupar por">
        <Select
          className="h-9 w-56"
          value={config.swimlane_mode}
          disabled={!canEdit}
          aria-label="Modo de swimlane"
          onChange={(e) => onSave({ swimlane_mode: e.target.value as SwimlaneMode })}
        >
          {Object.entries(SWIMLANE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </SettingRow>
    </SettingsCard>
  )
}

function CardLayoutCard({ config, canEdit, onSave }: TabProps) {
  const visible = new Set(config.card_fields)

  function toggleField(field: CardFieldKey, next: boolean) {
    const updated = next
      ? [...config.card_fields, field]
      : config.card_fields.filter((f) => f !== field)
    onSave({ card_fields: updated })
  }

  return (
    <SettingsCard
      title="Layout do card"
      description="Escolha o que aparece no card do quadro. O título é sempre visível."
    >
      <div className="divide-y divide-paper-200 dark:divide-ink-800">
        {config.available_card_fields.map((field) => (
          <SettingRow key={field} label={FIELD_LABEL[field] ?? field}>
            <Toggle
              checked={visible.has(field)}
              disabled={!canEdit}
              label={FIELD_LABEL[field] ?? field}
              onChange={(next) => toggleField(field, next)}
            />
          </SettingRow>
        ))}
        <SettingRow
          label="Ocultar concluídos após"
          hint="Em dias. 0 mantém todos os cards concluídos visíveis."
        >
          <Input
            type="number"
            min={0}
            className="h-9 w-24"
            defaultValue={config.hide_done_after_days}
            disabled={!canEdit}
            aria-label="Dias para ocultar cards concluídos"
            onBlur={(e) => {
              const days = Number(e.target.value || 0)
              if (days !== config.hide_done_after_days) {
                onSave({ hide_done_after_days: days })
              }
            }}
          />
        </SettingRow>
      </div>
    </SettingsCard>
  )
}

function CardColorsCard({ config, canEdit, onSave }: TabProps) {
  const values = COLOR_RULE_VALUES[config.card_color_rule]

  return (
    <SettingsCard
      title="Cores de card"
      description="Pinta a borda esquerda do card conforme o campo escolhido."
    >
      <SettingRow label="Colorir por">
        <Select
          className="h-9 w-56"
          value={config.card_color_rule}
          disabled={!canEdit}
          aria-label="Regra de cor do card"
          onChange={(e) => onSave({ card_color_rule: e.target.value as CardColorRule })}
        >
          {Object.entries(CARD_COLOR_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </SettingRow>

      {values && (
        <div className="mt-3 space-y-3 border-t border-paper-200 pt-4 dark:border-ink-800">
          {values.map(({ key, label }) => (
            <div key={key} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] text-ink dark:text-paper">{label}</span>
              <ColorPicker
                value={config.card_color_map[key] ?? "#6b7280"}
                disabled={!canEdit}
                onChange={(color) =>
                  onSave({ card_color_map: { ...config.card_color_map, [key]: color } })
                }
              />
            </div>
          ))}
        </div>
      )}

      {config.card_color_rule !== "none" && !values && (
        <p className="mt-3 border-t border-paper-200 pt-4 text-xs text-paper-500 dark:border-ink-800">
          Cores são atribuídas automaticamente, já que os valores desse campo mudam
          conforme o projeto.
        </p>
      )}
    </SettingsCard>
  )
}

function FeaturesCard({ config, canEdit, onSave }: TabProps) {
  return (
    <SettingsCard
      title="Funcionalidades"
      description="Liga ou desliga recursos do projeto."
    >
      <div className="divide-y divide-paper-200 dark:divide-ink-800">
        <SettingRow label="Sprints" hint="Planeje o trabalho em ciclos de tempo fixo.">
          <Toggle
            checked={config.sprints_enabled}
            disabled={!canEdit}
            label="Sprints"
            onChange={(next) => onSave({ sprints_enabled: next })}
          />
        </SettingRow>
        <SettingRow label="Estimativa" hint="Story points nos cards e nos relatórios.">
          <Toggle
            checked={config.estimation_enabled}
            disabled={!canEdit}
            label="Estimativa"
            onChange={(next) => onSave({ estimation_enabled: next })}
          />
        </SettingRow>
      </div>
    </SettingsCard>
  )
}
