import { useState } from "react"
import { Play, Plus, Trash2, ToggleLeft, ToggleRight, Clock, ChevronDown, ChevronRight } from "lucide-react"
import {
  useAutomationRules,
  useCreateAutomationRule,
  useDeleteAutomationRule,
  useRunAutomationRule,
  useUpdateAutomationRule,
  useAutomationRunLogs,
} from "@/features/workspace/workspace.hooks"
import type {
  AutomationActionType,
  AutomationCondition,
  AutomationRule,
  AutomationSchedule,
  AutomationTriggerType,
  CreateAutomationRuleInput,
} from "@/features/workspace/workspace.types"
import { cx } from "@/shared/ui/primitives"

const SCHEDULE_LABELS: Record<AutomationSchedule, string> = {
  hourly: "A cada hora",
  daily_morning: "Diário às 9h",
  daily_evening: "Diário às 18h",
  weekly_monday: "Toda segunda às 9h",
}

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  cron: "Agendado",
  status_changed: "Status alterado",
  card_created: "Card criado",
}

const ACTION_LABELS: Record<AutomationActionType, string> = {
  change_status: "Alterar status",
  assign_user: "Atribuir usuário",
  add_label: "Adicionar label",
  remove_label: "Remover label",
  set_priority: "Alterar prioridade",
}

const CONDITION_FIELDS = ["status", "priority", "type", "assignee", "due", "label"]
const PRIORITY_VALUES = ["low", "medium", "high", "urgent"]
const TYPE_VALUES = ["feature", "bug", "debt", "spike", "chore", "epic"]

interface Props {
  projectId: string
}

// ── Rule logs ────────────────────────────────────────────────────────────────
function RuleLogs({ ruleId }: { ruleId: string }) {
  const { data: logs } = useAutomationRunLogs(ruleId)
  if (!logs?.length) return <p className="text-xs text-gray-400 mt-2">Nenhuma execução registrada.</p>
  return (
    <div className="mt-2 space-y-1">
      {logs.slice(0, 10).map((log) => (
        <div key={log.id} className="flex items-center gap-3 text-xs">
          <span className={cx("font-medium", log.error ? "text-red-500" : "text-green-600")}>
            {log.error ? "ERRO" : "OK"}
          </span>
          <span className="text-gray-500">{log.cards_affected} cards afetados</span>
          <span className="text-gray-400">{log.triggered_by}</span>
          <span className="text-gray-400 ml-auto">{new Date(log.ran_at).toLocaleString("pt-BR")}</span>
          {log.error && <span className="text-red-400 truncate max-w-xs">{log.error}</span>}
        </div>
      ))}
    </div>
  )
}

// ── Rule card ────────────────────────────────────────────────────────────────
function RuleCard({
  rule,
  projectId,
}: {
  rule: AutomationRule
  projectId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const updateRule = useUpdateAutomationRule(projectId)
  const deleteRule = useDeleteAutomationRule(projectId)
  const runRule = useRunAutomationRule(projectId)

  const schedule = (rule.trigger_config?.schedule ?? "daily_morning") as AutomationSchedule

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:bg-ink-900 shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Toggle */}
        <button
          onClick={() => updateRule.mutate({ ruleId: rule.id, input: { enabled: !rule.enabled } })}
          className={cx("transition-colors", rule.enabled ? "text-green-500" : "text-gray-300")}
          title={rule.enabled ? "Desativar" : "Ativar"}
        >
          {rule.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-800 truncate">{rule.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            <span className="text-blue-500">{TRIGGER_LABELS[rule.trigger_type]}</span>
            {rule.trigger_type === "cron" && (
              <span className="ml-1">· {SCHEDULE_LABELS[schedule]}</span>
            )}
            {rule.conditions.length > 0 && (
              <span className="ml-1">· {rule.conditions.length} condição(ões)</span>
            )}
            <span className="ml-1">→ <span className="text-indigo-500">{ACTION_LABELS[rule.action_type]}</span></span>
          </p>
        </div>

        {/* Stats */}
        <div className="text-right text-xs text-gray-400 hidden sm:block">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {rule.last_run_at
              ? new Date(rule.last_run_at).toLocaleString("pt-BR")
              : "Nunca executada"}
          </div>
          <div>{rule.run_count} execução(ões)</div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => runRule.mutate(rule.id)}
            disabled={runRule.isPending}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            title="Executar agora"
          >
            <Play className="h-3 w-3" /> Executar
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-50"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => deleteRule.mutate(rule.id)}
            className="rounded-lg border border-red-100 p-1.5 text-red-400 hover:bg-red-50"
            title="Excluir"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded logs */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-3 pt-2">
          <p className="text-xs font-semibold text-gray-500 mb-1">Últimas execuções</p>
          <RuleLogs ruleId={rule.id} />
        </div>
      )}
    </div>
  )
}

// ── Create rule form ─────────────────────────────────────────────────────────
function CreateRuleForm({
  projectId,
  onClose,
}: {
  projectId: string
  onClose: () => void
}) {
  const createRule = useCreateAutomationRule(projectId)
  const [name, setName] = useState("")
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>("cron")
  const [schedule, setSchedule] = useState<AutomationSchedule>("daily_morning")
  const [actionType, setActionType] = useState<AutomationActionType>("change_status")
  const [actionValue, setActionValue] = useState("")
  const [conditions, setConditions] = useState<AutomationCondition[]>([])
  const [newCondField, setNewCondField] = useState("status")
  const [newCondOp, setNewCondOp] = useState<"=" | "!=" | "~">("=")
  const [newCondValue, setNewCondValue] = useState("")

  function addCondition() {
    if (!newCondValue.trim()) return
    setConditions((prev) => [...prev, { field: newCondField, op: newCondOp, value: newCondValue }])
    setNewCondValue("")
  }

  function removeCondition(i: number) {
    setConditions((prev) => prev.filter((_, idx) => idx !== i))
  }

  function buildActionConfig(): Record<string, string> {
    if (actionType === "change_status") return { status: actionValue }
    if (actionType === "set_priority") return { priority: actionValue }
    if (actionType === "add_label" || actionType === "remove_label") return { label: actionValue }
    if (actionType === "assign_user") return { user_id: actionValue }
    return {}
  }

  async function submit() {
    if (!name.trim() || !actionValue.trim()) return
    const input: CreateAutomationRuleInput = {
      name,
      trigger_type: triggerType,
      trigger_config: triggerType === "cron" ? { schedule } : {},
      conditions,
      action_type: actionType,
      action_config: buildActionConfig(),
    }
    await createRule.mutateAsync(input)
    onClose()
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-4">
      <p className="font-semibold text-sm text-gray-800">Nova automação</p>

      <div>
        <label className="text-xs text-gray-500">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Mover bugs urgentes para doing"
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">Trigger</label>
          <select
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value as AutomationTriggerType)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
          >
            {(Object.entries(TRIGGER_LABELS) as [AutomationTriggerType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {triggerType === "cron" && (
          <div>
            <label className="text-xs text-gray-500">Frequência</label>
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as AutomationSchedule)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            >
              {(Object.entries(SCHEDULE_LABELS) as [AutomationSchedule, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Conditions */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Condições (AND)</label>
        {conditions.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-xs mb-1">
            <span className="bg-white dark:bg-ink-900 border border-gray-200 rounded px-2 py-0.5 font-mono">
              {c.field} {c.op} {c.value}
            </span>
            <button onClick={() => removeCondition(i)} className="text-red-400 hover:text-red-600">×</button>
          </div>
        ))}
        <div className="flex gap-2">
          <select
            value={newCondField}
            onChange={(e) => setNewCondField(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1 text-xs"
          >
            {CONDITION_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            value={newCondOp}
            onChange={(e) => setNewCondOp(e.target.value as "=" | "!=" | "~")}
            className="rounded border border-gray-200 px-2 py-1 text-xs w-16"
          >
            <option value="=">=</option>
            <option value="!=">!=</option>
            <option value="~">~</option>
          </select>
          <input
            value={newCondValue}
            onChange={(e) => setNewCondValue(e.target.value)}
            placeholder="valor"
            className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs"
            list="cond-values"
          />
          <datalist id="cond-values">
            {[...PRIORITY_VALUES, ...TYPE_VALUES, "todo", "doing", "done", "review", "overdue", "unassigned"].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <button
            onClick={addCondition}
            className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200"
          >
            + Adicionar
          </button>
        </div>
      </div>

      {/* Action */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">Ação</label>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as AutomationActionType)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
          >
            {(Object.entries(ACTION_LABELS) as [AutomationActionType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Valor da ação</label>
          <input
            value={actionValue}
            onChange={(e) => setActionValue(e.target.value)}
            placeholder={
              actionType === "change_status" ? "ex: doing" :
              actionType === "set_priority" ? "ex: high" :
              actionType.includes("label") ? "ex: urgente" :
              "UUID do usuário"
            }
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            list="action-values"
          />
          <datalist id="action-values">
            {[...PRIORITY_VALUES, ...TYPE_VALUES, "todo", "doing", "done", "review"].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={createRule.isPending || !name.trim() || !actionValue.trim()}
          className="rounded-lg bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {createRule.isPending ? "Criando…" : "Criar automação"}
        </button>
      </div>
    </div>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────
export function AutomacoesView({ projectId }: Props) {
  const { data: rules, isLoading } = useAutomationRules(projectId)
  const [creating, setCreating] = useState(false)

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Automações</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Regras que rodam automaticamente e agem sobre cards do projeto.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
        >
          <Plus className="h-4 w-4" /> Nova regra
        </button>
      </div>

      {creating && (
        <CreateRuleForm projectId={projectId} onClose={() => setCreating(false)} />
      )}

      {isLoading && (
        <p className="text-sm text-gray-400">Carregando…</p>
      )}

      {!isLoading && !rules?.length && !creating && (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center">
          <Clock className="mx-auto h-8 w-8 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">Nenhuma automação ainda</p>
          <p className="text-xs text-gray-400 mt-1">
            Crie regras que rodam em schedule e agem sobre cards automaticamente.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {(rules ?? []).map((rule) => (
          <RuleCard key={rule.id} rule={rule} projectId={projectId} />
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <p className="font-medium mb-1">Execução via cron do sistema:</p>
        <code className="font-mono text-xs bg-white dark:bg-ink-900 border border-gray-200 rounded px-2 py-1 block w-fit">
          */15 * * * * python manage.py run_automations
        </code>
        <p className="mt-1">Ou execute qualquer regra manualmente com o botão "Executar".</p>
      </div>
    </div>
  )
}
