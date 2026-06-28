import { Check, FileText, Loader2, Sparkles, Upload } from "lucide-react"
import { useState } from "react"

import { PageHeader } from "@/shared/ui/primitives"
import { useProjects, useWorkspaces } from "@/features/workspace/workspace.hooks"
import {
  analyzeDocument,
  createTasksFromDocument,
  ingestFile,
  ingestText,
  type Analysis,
  type CopilotDocument,
  type DocKind,
  type SuggestedTask,
} from "./copilot.api"

type Mode = "text" | "file"

export function CopilotPage() {
  const { activeWorkspaceId } = useWorkspaces()
  const { data: projects } = useProjects(activeWorkspaceId)

  const [mode, setMode] = useState<Mode>("text")
  const [title, setTitle] = useState("")
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [doc, setDoc] = useState<CopilotDocument | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [projectId, setProjectId] = useState<string>("")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [createdMsg, setCreatedMsg] = useState<string | null>(null)

  const reset = () => {
    setDoc(null)
    setAnalysis(null)
    setSelected(new Set())
    setCreatedMsg(null)
  }

  const kindFromFile = (f: File): DocKind => {
    const n = f.name.toLowerCase()
    if (n.endsWith(".pdf")) return "pdf"
    if (n.endsWith(".docx")) return "docx"
    return "audio"
  }

  const handleAnalyze = async () => {
    if (!activeWorkspaceId) return
    setError(null)
    setBusy("Importando e analisando…")
    reset()
    try {
      const d =
        mode === "text"
          ? await ingestText(activeWorkspaceId, title || "Documento", text)
          : await ingestFile(activeWorkspaceId, title || file!.name, kindFromFile(file!), file!)
      setDoc(d)
      const a = await analyzeDocument(d.id)
      setAnalysis(a)
      setSelected(new Set(a.tasks.map((_, i) => i))) // pré-seleciona todas
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const toggle = (i: number) => {
    setSelected((s) => {
      const next = new Set(s)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const handleCreate = async () => {
    if (!doc || !analysis || !projectId) return
    setError(null)
    setBusy("Criando cards…")
    try {
      const tasks: SuggestedTask[] = analysis.tasks.filter((_, i) => selected.has(i))
      const res = await createTasksFromDocument(doc.id, projectId, tasks)
      setCreatedMsg(`${res.created.length} card(s) criado(s): ${res.created.map((c) => c.ref).join(", ")}`)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const canAnalyze = mode === "text" ? text.trim().length > 20 : !!file

  if (!activeWorkspaceId)
    return (
      <div className="py-16 text-center text-sm text-paper-500">
        Crie um workspace na aba Boards primeiro.
      </div>
    )

  return (
    <div className="space-y-6">
      <PageHeader title="Copiloto" subtitle="Leia documentos e transcrições e gere tarefas com IA" />

      {/* Entrada */}
      <div className="rounded-2xl border border-ink/10 bg-paper dark:bg-ink-900 p-5 space-y-4">
        <div className="flex gap-2">
          {(["text", "file"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                mode === m ? "border-ink bg-ink text-paper" : "border-ink/15 text-paper-600 hover:text-ink dark:hover:text-paper"
              }`}
            >
              {m === "text" ? "Colar texto" : "Enviar arquivo"}
            </button>
          ))}
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título do documento (opcional)"
          className="w-full rounded-lg border border-ink/15 bg-paper-100 dark:bg-ink-800 px-3 py-2 text-sm"
        />

        {mode === "text" ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Cole aqui a transcrição da reunião, ata ou especificação…"
            rows={8}
            className="w-full rounded-lg border border-ink/15 bg-paper-100 dark:bg-ink-800 px-3 py-2 text-sm"
          />
        ) : (
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-ink/20 px-4 py-6 text-sm text-paper-500 hover:border-ink/40">
            <Upload className="size-5" />
            {file ? file.name : "Escolher PDF, DOCX ou áudio"}
            <input
              type="file"
              accept=".pdf,.docx,audio/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
        )}

        <button
          onClick={handleAnalyze}
          disabled={!canAnalyze || !!busy}
          className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {busy ?? "Analisar com IA"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* Resultado */}
      {analysis && (
        <div className="space-y-5">
          <Section title="Resumo">
            <p className="text-sm leading-relaxed text-ink dark:text-paper">{analysis.summary}</p>
          </Section>

          {analysis.tasks.length > 0 && (
            <Section title={`Tarefas sugeridas (${analysis.tasks.length})`}>
              <ul className="space-y-2">
                {analysis.tasks.map((t, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-xl border border-ink/10 p-3"
                  >
                    <button
                      onClick={() => toggle(i)}
                      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border ${
                        selected.has(i) ? "border-ink bg-ink text-paper" : "border-ink/30"
                      }`}
                    >
                      {selected.has(i) && <Check className="size-3.5" />}
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink dark:text-paper">{t.title}</p>
                      {t.description && (
                        <p className="text-xs text-paper-500">{t.description}</p>
                      )}
                      <div className="mt-1 flex gap-2 text-[10px] uppercase text-paper-500">
                        <span className="rounded bg-ink/5 px-1.5 py-0.5">{t.priority}</span>
                        <span className="rounded bg-ink/5 px-1.5 py-0.5">{t.type}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="rounded-lg border border-ink/15 bg-paper-100 dark:bg-ink-800 px-3 py-2 text-sm"
                >
                  <option value="">Escolha o projeto…</option>
                  {(projects ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.key} — {p.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleCreate}
                  disabled={!projectId || selected.size === 0 || !!busy}
                  className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
                >
                  Criar {selected.size} card(s)
                </button>
                {createdMsg && (
                  <span className="text-sm text-green-700">{createdMsg}</span>
                )}
              </div>
              {(!projects || projects.length === 0) && (
                <p className="mt-2 text-xs text-paper-500">
                  Crie um projeto na aba Boards para poder gerar cards.
                </p>
              )}
            </Section>
          )}

          {analysis.decisions.length > 0 && (
            <Section title="Decisões">
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink dark:text-paper">
                {analysis.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </Section>
          )}

          {analysis.risks.length > 0 && (
            <Section title="Riscos">
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink dark:text-paper">
                {analysis.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-paper dark:bg-ink-900 p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink dark:text-paper">
        <FileText className="size-4" /> {title}
      </h3>
      {children}
    </div>
  )
}

function errMsg(e: unknown): string {
  const anyE = e as { response?: { data?: { error?: string; detail?: string } } }
  return (
    anyE?.response?.data?.error ??
    anyE?.response?.data?.detail ??
    "Não foi possível concluir. Verifique se o Copiloto IA está configurado."
  )
}
