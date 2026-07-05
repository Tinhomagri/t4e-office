// Aba Documentos: documentos colaborativos de verdade — persistidos no
// servidor e compartilhados com todo o time do projeto (não mais um
// protótipo em localStorage). Sincroniza com um poll leve (estilo Planning
// Poker) para refletir edições de outros membros sem precisar de WebSocket.
import { Check, Clock, FileText, Plus, Trash2, Users } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cx } from "@/shared/ui/primitives"
import { DocumentEditor } from "../DocumentEditor"
import { ColoredAvatar } from "../board.shared"
import { useAuthStore } from "@/features/auth/auth.store"
import {
  useCreateDocument,
  useDeleteDocument,
  useDocument,
  useDocuments,
  useUpdateDocument,
} from "@/features/workspace/workspace.hooks"
import { updateDocument as apiUpdateDocument } from "@/features/workspace/workspace.api"
import type { Member } from "@/features/workspace/workspace.types"

// Prévia em texto puro (sem tags HTML) para a lista lateral.
function preview(html: string): string {
  const div = document.createElement("div")
  div.innerHTML = html
  return (div.textContent ?? "").trim()
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

function editorLabel(userId: string | null, members: Member[], currentUserId: string): string {
  if (!userId) return ""
  if (userId === currentUserId) return "Você"
  return members.find((m) => m.user_id === userId)?.name.split(" ")[0] ?? "alguém"
}

export function DocumentosView({ projectId, members }: { projectId: string; members: Member[] }) {
  const currentUserId = useAuthStore((s) => s.user?.id ?? "")
  const { data: docs, isLoading: listLoading } = useDocuments(projectId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: detail, isLoading: detailLoading } = useDocument(selectedId)
  const createDoc = useCreateDocument(projectId)
  const updateDoc = useUpdateDocument(selectedId)
  const deleteDoc = useDeleteDocument(projectId)

  const [editTitle, setEditTitle] = useState("")
  const [editContent, setEditContent] = useState("")
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const pendingRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedDocId = useRef<string | null>(null)

  // Seleciona o primeiro documento automaticamente quando a lista carrega.
  useEffect(() => {
    if (!selectedId && docs && docs.length > 0) setSelectedId(docs[0].id)
  }, [docs, selectedId])

  // Preenche o editor com o conteúdo do servidor — ao trocar de documento
  // (sempre aceita) ou quando o poll trouxe uma versão nova (só aceita se
  // não houver edição local pendente, para não apagar o que a pessoa digitou).
  useEffect(() => {
    if (!detail) return
    const switchedDoc = loadedDocId.current !== detail.id
    if (switchedDoc || !pendingRef.current) {
      setEditTitle(detail.title)
      setEditContent(detail.content)
    }
    loadedDocId.current = detail.id
  }, [detail])

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  function selectDoc(id: string) {
    if (id === selectedId) return
    flushPending()
    setSelectedId(id)
  }

  // Garante que uma edição em andamento não se perca ao trocar de documento
  // rápido demais (antes do debounce de 600ms disparar).
  function flushPending() {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    if (pendingRef.current && selectedId) {
      apiUpdateDocument(selectedId, { title: editTitle, content: editContent }).catch(() => {})
    }
    pendingRef.current = false
  }

  async function createNewDoc() {
    flushPending()
    const doc = await createDoc.mutateAsync({ title: "Novo documento", content: "" })
    loadedDocId.current = doc.id
    setEditTitle(doc.title)
    setEditContent(doc.content)
    setSelectedId(doc.id)
  }

  // Autosave com debounce — editor rich-text não tem um "submit" natural;
  // salvar a cada pausa de digitação evita perder trabalho.
  function scheduleSave(title: string, content: string) {
    if (!selectedId) return
    pendingRef.current = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateDoc.mutate(
        { title, content },
        { onSuccess: () => { pendingRef.current = false; setSavedAt(Date.now()) } },
      )
    }, 600)
  }

  async function handleDelete(id: string) {
    flushPending()
    await deleteDoc.mutateAsync(id)
    if (selectedId === id) {
      const remaining = (docs ?? []).filter((d) => d.id !== id)
      setSelectedId(remaining[0]?.id ?? null)
      if (remaining.length === 0) { setEditTitle(""); setEditContent("") }
    }
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-18rem)]">
      {/* Sidebar: doc list */}
      <div className="flex w-64 shrink-0 flex-col rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900">
        <div className="flex items-center justify-between border-b border-paper-100 dark:border-ink-800 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-paper-500">
            <Users className="size-3.5" /> Documentos do time
          </span>
          <button
            onClick={createNewDoc}
            disabled={createDoc.isPending}
            className="grid size-6 place-items-center rounded-md text-paper-400 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper transition-colors disabled:opacity-40"
            title="Novo documento"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 scrollbar-slim">
          {listLoading && (
            <p className="px-2 py-4 text-center text-xs text-paper-400">Carregando…</p>
          )}
          {!listLoading && (docs ?? []).length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-paper-400">Nenhum documento ainda</p>
          )}
          {(docs ?? []).map((doc) => {
            const isSelected = doc.id === selectedId
            const showLive = isSelected ? preview(editContent) : null
            return (
              <button
                key={doc.id}
                onClick={() => selectDoc(doc.id)}
                className={cx(
                  "flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors",
                  isSelected ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-ink dark:text-paper hover:bg-paper-50 dark:hover:bg-ink-800",
                )}
              >
                <FileText className="mt-0.5 size-3.5 shrink-0 text-paper-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {(isSelected ? editTitle : doc.title) || "Sem título"}
                  </p>
                  <p className="truncate text-[10px] text-paper-400">
                    {(showLive ?? "") || "Sem conteúdo"}
                  </p>
                  <p className="flex items-center gap-1 text-[10px] text-paper-300">
                    <Clock className="size-2.5" />
                    {fmt(doc.updated_at)}
                    {doc.updated_by && ` · ${editorLabel(doc.updated_by, members, currentUserId)}`}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Editor */}
      {selectedId ? (
        <div className="flex flex-1 flex-col rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 overflow-hidden">
          {/* Cabeçalho: título + colaboradores + status de salvamento + excluir */}
          <div className="flex items-center gap-2 border-b border-paper-100 dark:border-ink-800 px-4 py-2.5">
            <input
              value={editTitle}
              onChange={(e) => {
                setEditTitle(e.target.value)
                scheduleSave(e.target.value, editContent)
              }}
              placeholder="Título do documento"
              className="min-w-0 flex-1 bg-transparent text-base font-semibold text-ink dark:text-paper outline-none placeholder-paper-300"
            />
            <div className="flex items-center gap-3 ml-auto">
              {members.length > 0 && (
                <div className="hidden items-center -space-x-1.5 sm:flex" title="Membros com acesso a este documento">
                  {members.slice(0, 4).map((m) => (
                    <ColoredAvatar key={m.user_id} name={m.name} size="xs" />
                  ))}
                </div>
              )}
              <SaveStatus savedAt={savedAt} saving={updateDoc.isPending} />
              <button
                onClick={() => handleDelete(selectedId)}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-paper-400 hover:bg-danger/10 hover:text-danger transition-colors"
                title="Excluir documento"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Editor rich-text completo: blocos, tabela, imagem, link, checklist, fonte, cor... */}
          {detailLoading && !detail ? (
            <div className="flex flex-1 items-center justify-center text-sm text-paper-400">
              Carregando documento…
            </div>
          ) : (
            <DocumentEditor
              key={selectedId}
              value={editContent}
              onChange={(html) => {
                setEditContent(html)
                scheduleSave(editTitle, html)
              }}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-paper-300 bg-paper-50 dark:bg-ink-900">
          <div className="text-center">
            <FileText className="mx-auto mb-3 size-10 text-paper-300" />
            <p className="font-medium text-paper-500">Nenhum documento selecionado</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-paper-400">
              Documentos aqui são compartilhados com todo o time do projeto.
            </p>
            <button
              onClick={createNewDoc}
              disabled={createDoc.isPending}
              className="mt-3 flex items-center gap-1.5 mx-auto rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors disabled:opacity-40"
            >
              <Plus className="size-4" /> Criar documento
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Indicador discreto de autosave — evita um botão "Salvar" que ninguém
// clica em editores rich-text (o padrão aqui é salvar sozinho ao pausar).
function SaveStatus({ savedAt, saving }: { savedAt: number | null; saving: boolean }) {
  const [, forceTick] = useState(0)

  useEffect(() => {
    if (!savedAt) return
    const id = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [savedAt])

  if (saving) {
    return <span className="text-[11px] text-paper-400">Salvando…</span>
  }
  if (!savedAt) return null
  const secs = Math.round((Date.now() - savedAt) / 1000)
  const label = secs < 2 ? "Salvo agora" : secs < 60 ? `Salvo há ${secs}s` : "Salvo"

  return (
    <span className="flex items-center gap-1 text-[11px] text-paper-400">
      <Check className="size-3 text-success" /> {label}
    </span>
  )
}
