// Importar boards do Jira/Trello — cola o JSON de export, revisa o preview
// (mapeamento de status feito no backend) e cria os cards no projeto escolhido.
import { ArrowRight, Check, Upload } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  executeImport,
  previewImport,
  type ImportItem,
  type ImportProvider,
} from "@/features/integrations/social.api"
import { useProjects } from "@/features/workspace/workspace.hooks"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { Button, PageHeader, Textarea, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog", todo: "A fazer", doing: "Em andamento", review: "Em revisão", done: "Concluído",
}

export function ImportBoardPage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const navigate = useNavigate()
  const projects = useProjects(workspaceId)
  const [provider, setProvider] = useState<ImportProvider>("trello")
  const [raw, setRaw] = useState("")
  const [jobId, setJobId] = useState<string | null>(null)
  const [items, setItems] = useState<ImportItem[]>([])
  const [checked, setChecked] = useState<boolean[]>([])
  const [projectId, setProjectId] = useState("")
  const [busy, setBusy] = useState(false)

  const preview = async () => {
    if (!workspaceId) return
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      toast.error("JSON inválido. Cole o export completo da ferramenta.")
      return
    }
    setBusy(true)
    try {
      const r = await previewImport(workspaceId, provider, payload)
      setJobId(r.job_id)
      setItems(r.items)
      setChecked(r.items.map(() => true))
    } catch (e) {
      toast.error("Não consegui extrair itens desse export.")
    } finally {
      setBusy(false)
    }
  }

  const execute = async () => {
    if (!jobId || !projectId) {
      toast.error("Escolha o projeto de destino.")
      return
    }
    const selected = checked.flatMap((on, i) => (on ? [i] : []))
    if (selected.length === 0) {
      toast.error("Selecione ao menos um item.")
      return
    }
    setBusy(true)
    try {
      const r = await executeImport(jobId, projectId, selected)
      toast.success(`${r.created} card(s) importados!`)
      navigate(`/app/boards?project=${projectId}`)
    } catch {
      toast.error("Falha ao importar.")
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setJobId(null)
    setItems([])
    setChecked([])
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        eyebrow="Integrações"
        title="Importar Jira / Trello"
        subtitle="Traga um board externo: cole o JSON de export, revise e importe como cards."
      />
      {!workspaceId ? (
        <p className="text-sm text-paper-400">Selecione um workspace.</p>
      ) : jobId === null ? (
        <div className="space-y-4">
          <div className="flex gap-1 rounded-xl border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-900 p-1 w-fit">
            {(["trello", "jira"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={cx(
                  "rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                  provider === p
                    ? "bg-white dark:bg-ink-800 text-ink dark:text-paper shadow-sm"
                    : "text-paper-500 hover:text-ink dark:hover:text-paper",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="text-xs text-paper-400">
            {provider === "trello"
              ? "No Trello: Menu do board → Imprimir e exportar → Exportar como JSON."
              : "No Jira: busca de issues → Exportar → JSON (contendo issues[].fields)."}
          </p>
          <Textarea
            rows={12}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder='Cole aqui o JSON do export…'
            className="font-mono text-xs"
          />
          <Button
            icon={<Upload className="size-4" />}
            loading={busy}
            disabled={!raw.trim()}
            onClick={preview}
          >
            Gerar preview
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink dark:text-paper">
              <strong>{checked.filter(Boolean).length}</strong> de {items.length} itens selecionados
            </p>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-2 py-1.5 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
              aria-label="Projeto de destino"
            >
              <option value="">Projeto de destino…</option>
              {(projects.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.key} — {p.name}</option>
              ))}
            </select>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" onClick={reset}>Voltar</Button>
              <Button icon={<ArrowRight className="size-4" />} loading={busy} onClick={execute}>
                Importar selecionados
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-200 dark:border-ink-700 text-left text-[11px] font-bold uppercase tracking-widest text-paper-500">
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={checked.every(Boolean)}
                      onChange={(e) => setChecked(items.map(() => e.target.checked))}
                      aria-label="Selecionar todos"
                    />
                  </th>
                  <th className="px-3 py-2.5">Chave</th>
                  <th className="px-3 py-2.5">Título</th>
                  <th className="px-3 py-2.5">Status externo</th>
                  <th className="px-3 py-2.5">Vira status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-paper-100 dark:border-ink-800 last:border-0">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked[i]}
                        onChange={(e) =>
                          setChecked((c) => c.map((v, j) => (j === i ? e.target.checked : v)))
                        }
                        aria-label={`Selecionar ${item.title}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-paper-400">{item.external_key}</td>
                    <td className="px-3 py-2 text-ink dark:text-paper">{item.title}</td>
                    <td className="px-3 py-2 text-xs text-paper-500">{item.external_status || "—"}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-600/10 px-2 py-0.5 text-[11px] font-medium text-brand-600">
                        <Check className="size-3" /> {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
