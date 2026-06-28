import { FileText, Plus, Save, Trash2 } from "lucide-react"
import { useState } from "react"
import { cx } from "@/shared/ui/primitives"

interface Doc {
  id: string
  title: string
  content: string
  updatedAt: string
}

const STORAGE_KEY = (projectId: string) => `pulse_docs_${projectId}`

function loadDocs(projectId: string): Doc[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY(projectId)) ?? "[]")
  } catch {
    return []
  }
}

function saveDocs(projectId: string, docs: Doc[]) {
  localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(docs))
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

export function DocumentosView({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<Doc[]>(() => loadDocs(projectId))
  const [selectedId, setSelectedId] = useState<string | null>(docs[0]?.id ?? null)
  const [editTitle, setEditTitle] = useState("")
  const [editContent, setEditContent] = useState("")
  const [dirty, setDirty] = useState(false)

  const selected = docs.find((d) => d.id === selectedId) ?? null

  function select(doc: Doc) {
    setSelectedId(doc.id)
    setEditTitle(doc.title)
    setEditContent(doc.content)
    setDirty(false)
  }

  function createDoc() {
    const doc: Doc = {
      id: crypto.randomUUID(),
      title: "Novo documento",
      content: "",
      updatedAt: new Date().toISOString(),
    }
    const next = [doc, ...docs]
    setDocs(next)
    saveDocs(projectId, next)
    select(doc)
  }

  function save() {
    if (!selectedId) return
    const next = docs.map((d) =>
      d.id === selectedId
        ? { ...d, title: editTitle, content: editContent, updatedAt: new Date().toISOString() }
        : d,
    )
    setDocs(next)
    saveDocs(projectId, next)
    setDirty(false)
  }

  function deleteDoc(id: string) {
    const next = docs.filter((d) => d.id !== id)
    setDocs(next)
    saveDocs(projectId, next)
    if (selectedId === id) {
      const first = next[0]
      if (first) select(first)
      else { setSelectedId(null); setEditTitle(""); setEditContent("") }
    }
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-18rem)]">
      {/* Sidebar: doc list */}
      <div className="flex w-56 shrink-0 flex-col rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900">
        <div className="flex items-center justify-between border-b border-paper-100 dark:border-ink-800 px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-paper-500">Documentos</span>
          <button
            onClick={createDoc}
            className="grid size-6 place-items-center rounded-md text-paper-400 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper transition-colors"
            title="Novo documento"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 scrollbar-slim">
          {docs.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-paper-400">Nenhum documento</p>
          )}
          {docs.map((doc) => (
            <button
              key={doc.id}
              onClick={() => select(doc)}
              className={cx(
                "flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors",
                doc.id === selectedId ? "bg-brand-50 text-brand-700" : "text-ink dark:text-paper hover:bg-paper-50 dark:hover:bg-ink-900",
              )}
            >
              <FileText className="mt-0.5 size-3.5 shrink-0 text-paper-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{doc.title || "Sem título"}</p>
                <p className="text-[10px] text-paper-400">{fmt(doc.updatedAt)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      {selected ? (
        <div className="flex flex-1 flex-col rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b border-paper-100 dark:border-ink-800 px-4 py-2.5">
            <input
              value={editTitle}
              onChange={(e) => { setEditTitle(e.target.value); setDirty(true) }}
              placeholder="Título do documento"
              className="flex-1 bg-transparent text-base font-semibold text-ink dark:text-paper outline-none placeholder-paper-300"
            />
            <div className="flex items-center gap-1.5 ml-auto">
              {dirty && (
                <button
                  onClick={save}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 transition-colors"
                >
                  <Save className="size-3.5" /> Salvar
                </button>
              )}
              <button
                onClick={() => deleteDoc(selected.id)}
                className="grid size-7 place-items-center rounded-lg text-paper-400 hover:bg-danger/10 hover:text-danger transition-colors"
                title="Excluir"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Content area */}
          <textarea
            value={editContent}
            onChange={(e) => { setEditContent(e.target.value); setDirty(true) }}
            placeholder="Escreva aqui... (suporta Markdown)"
            className="flex-1 resize-none bg-transparent px-6 py-5 text-sm leading-relaxed text-ink dark:text-paper placeholder-paper-300 outline-none font-mono"
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault()
                save()
              }
            }}
          />

          <div className="border-t border-paper-100 dark:border-ink-800 px-4 py-2 text-[11px] text-paper-400">
            {editContent.length} chars · {editContent.split(/\s+/).filter(Boolean).length} palavras · Ctrl+S para salvar
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-paper-300 bg-paper-50 dark:bg-ink-900">
          <div className="text-center">
            <FileText className="mx-auto mb-3 size-10 text-paper-300" />
            <p className="font-medium text-paper-500">Nenhum documento selecionado</p>
            <button
              onClick={createDoc}
              className="mt-3 flex items-center gap-1.5 mx-auto rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
            >
              <Plus className="size-4" /> Criar documento
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
