import Highlight from "@tiptap/extension-highlight"
import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import TaskItem from "@tiptap/extension-task-item"
import TaskList from "@tiptap/extension-task-list"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  Bold,
  ChevronDown,
  Code,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo2,
  Sparkles,
  Strikethrough,
  Undo2,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { cx } from "./primitives"

// Editor rich-text (Tiptap) para descrições e comentários de card.
// Emite HTML via onChange.
//
// A barra de IA (`onAiAssist`) é opcional: quem monta o editor decide se aquele
// campo tem assistência de escrita, porque ela depende da IA configurada no
// workspace e nem todo lugar que usa o editor tem workspace em mãos.
export type AiAction =
  | "improve"
  | "fix_grammar"
  | "summarize"
  | "expand"
  | "shorten"
  | "to_bullets"
  | "acceptance_criteria"
  | "change_tone"
  | "translate"

export type PastedAttachment = { url: string; name: string; mimeType: string }

// Ações que precisam de um alvo abrem um submenu em vez de rodar direto.
// Os valores espelham os catálogos de `writing_skills.py` no backend.
const AI_TARGETS: Record<string, { key: string; label: string }[]> = {
  change_tone: [
    { key: "professional", label: "Profissional" },
    { key: "casual", label: "Casual" },
    { key: "empathetic", label: "Empático" },
    { key: "direct", label: "Direto" },
    { key: "educational", label: "Didático" },
  ],
  translate: [
    { key: "pt-BR", label: "Português (BR)" },
    { key: "en", label: "Inglês" },
    { key: "es", label: "Espanhol" },
    { key: "fr", label: "Francês" },
    { key: "de", label: "Alemão" },
    { key: "it", label: "Italiano" },
  ],
}

const AI_ACTIONS: { id: AiAction; label: string; hint: string }[] = [
  { id: "improve", label: "Melhorar escrita", hint: "Clareza e objetividade" },
  { id: "fix_grammar", label: "Corrigir gramática", hint: "Só ortografia e pontuação" },
  { id: "summarize", label: "Resumir", hint: "Reduz ao essencial" },
  { id: "expand", label: "Expandir", hint: "Detalha o que já está dito" },
  { id: "shorten", label: "Encurtar", hint: "Corta redundância" },
  { id: "to_bullets", label: "Virar tópicos", hint: "Lista com marcadores" },
  {
    id: "acceptance_criteria",
    label: "Gerar critérios de aceite",
    hint: "Formato Dado/Quando/Então",
  },
  { id: "change_tone", label: "Alterar o tom", hint: "Mesmo conteúdo, outro registro" },
  { id: "translate", label: "Traduzir", hint: "Preserva formatação e termos" },
]

export function RichEditor({
  value,
  onChange,
  placeholder = "Escreva uma descrição…",
  onAiAssist,
  onPasteFiles,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  /**
   * Recebe o texto puro do editor e devolve o texto reescrito pela IA.
   * `target` vem preenchido nas ações que pedem um alvo (tom, idioma).
   */
  onAiAssist?: (text: string, action: AiAction, target?: string) => Promise<string>
  /** Arquivos copiados (print, foto ou documento) são entregues ao dono do
   * editor; texto/HTML continua pelo pipeline nativo do Tiptap. */
  onPasteFiles?: (files: File[]) => Promise<PastedAttachment[]>
}) {
  const onPasteFilesRef = useRef(onPasteFiles)
  onPasteFilesRef.current = onPasteFiles
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Placeholder.configure({ placeholder }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({
        allowBase64: false,
        HTMLAttributes: { class: "my-3 max-h-[420px] max-w-full rounded-xl border border-paper-200 object-contain dark:border-ink-700" },
      }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: value || "",
    editorProps: {
      handlePaste: (view, event) => {
        const itemFiles = Array.from(event.clipboardData?.items ?? [])
          .filter((item) => item.kind === "file")
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)
        const files = itemFiles.length > 0 ? itemFiles : Array.from(event.clipboardData?.files ?? [])
        if (files.length === 0 || !onPasteFilesRef.current) return false
        void onPasteFilesRef.current(files).then((attachments) => {
          for (const attachment of attachments) {
            const { schema } = view.state
            if (attachment.mimeType.startsWith("image/") && schema.nodes.image) {
              const image = schema.nodes.image.create({ src: attachment.url, alt: attachment.name, title: attachment.name })
              view.dispatch(view.state.tr.replaceSelectionWith(image).scrollIntoView())
              continue
            }
            const mark = schema.marks.link?.create({ href: attachment.url, target: "_blank", rel: "noopener noreferrer" })
            const text = schema.text(`📎 ${attachment.name}`, mark ? [mark] : [])
            view.dispatch(view.state.tr.replaceSelectionWith(text).insertText(" ").scrollIntoView())
          }
        }).catch(() => {})
        // Se junto do arquivo houver texto, deixa o Tiptap colá-lo normalmente.
        // Print puro não tem texto útil e deve virar somente anexo.
        const hasText = !!event.clipboardData?.getData("text/plain") || !!event.clipboardData?.getData("text/html")
        if (hasText) return false
        event.preventDefault()
        return true
      },
      attributes: {
        class:
          "prose-sm min-h-[120px] max-w-none px-3 py-2.5 text-sm text-ink dark:text-paper focus:outline-none " +
          "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_p]:my-1 " +
          "[&_h1]:mb-1 [&_h1]:mt-2 [&_h1]:text-lg [&_h1]:font-bold " +
          "[&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold " +
          "[&_blockquote]:border-l-2 [&_blockquote]:border-paper-300 [&_blockquote]:pl-3 [&_blockquote]:text-paper-500 " +
          "[&_code]:rounded [&_code]:bg-paper-100 [&_code]:px-1 [&_code]:text-[12px] dark:[&_code]:bg-ink-800 " +
          "[&_pre]:rounded-lg [&_pre]:bg-paper-100 [&_pre]:p-2 [&_pre]:text-[12px] dark:[&_pre]:bg-ink-800 " +
          "[&_a]:text-brand-600 [&_a]:underline " +
          "[&_mark]:rounded [&_mark]:bg-amber-200 [&_mark]:px-0.5 dark:[&_mark]:bg-amber-500/40 " +
          "[&_hr]:my-3 [&_hr]:border-paper-200 dark:[&_hr]:border-ink-700 " +
          "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0 " +
          "[&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:gap-2 " +
          "[&_p.is-editor-empty:first-child]:before:pointer-events-none " +
          "[&_p.is-editor-empty:first-child]:before:float-left " +
          "[&_p.is-editor-empty:first-child]:before:h-0 " +
          "[&_p.is-editor-empty:first-child]:before:text-paper-400 " +
          "[&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Sincroniza quando o card aberto muda (value externo).
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  if (!editor) return null

  return (
    <div className="rounded-xl border border-paper-300 bg-paper transition-colors focus-within:border-brand-400 dark:bg-ink-900">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-paper-200 px-1.5 py-1 dark:border-ink-700">
        <ToolBtn
          label="Negrito"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </ToolBtn>
        <ToolBtn
          label="Itálico"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </ToolBtn>
        <ToolBtn
          label="Tachado"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-4" />
        </ToolBtn>
        <ToolBtn
          label="Marca-texto"
          active={editor.isActive("highlight")}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        >
          <Highlighter className="size-4" />
        </ToolBtn>

        <Divider />

        <ToolBtn
          label="Título"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 className="size-4" />
        </ToolBtn>
        <ToolBtn
          label="Subtítulo"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-4" />
        </ToolBtn>

        <Divider />

        <ToolBtn
          label="Lista"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" />
        </ToolBtn>
        <ToolBtn
          label="Lista numerada"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" />
        </ToolBtn>
        <ToolBtn
          label="Checklist"
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListChecks className="size-4" />
        </ToolBtn>

        <Divider />

        <ToolBtn
          label="Citação"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-4" />
        </ToolBtn>
        <ToolBtn
          label="Bloco de código"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code className="size-4" />
        </ToolBtn>
        <LinkButton editor={editor} />
        <ToolBtn
          label="Linha divisória"
          active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus className="size-4" />
        </ToolBtn>

        <Divider />

        <ToolBtn
          label="Desfazer"
          active={false}
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="size-4" />
        </ToolBtn>
        <ToolBtn
          label="Refazer"
          active={false}
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="size-4" />
        </ToolBtn>

        {onAiAssist && (
          <>
            <div className="flex-1" />
            <AiMenu editor={editor} onAssist={onAiAssist} />
          </>
        )}
      </div>
      <EditorContent editor={editor} />
      {onPasteFiles && <p className="border-t border-paper-100 px-3 py-1.5 text-[11px] text-paper-400 dark:border-ink-800">Cole texto normalmente ou use Ctrl+V para anexar prints, fotos e documentos.</p>}
    </div>
  )
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-paper-200 dark:bg-ink-700" />
}

// ── Link ─────────────────────────────────────────────────────────────────────

function LinkButton({ editor }: { editor: Editor }) {
  const active = editor.isActive("link")

  function toggle() {
    if (active) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const previous = (editor.getAttributes("link").href as string) ?? ""
    const url = window.prompt("Endereço do link", previous)
    if (url === null) return
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run()
      return
    }
    // Sem esquema o navegador trataria "exemplo.com" como caminho relativo.
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run()
  }

  return (
    <ToolBtn label={active ? "Remover link" : "Inserir link"} active={active} onClick={toggle}>
      <Link2 className="size-4" />
    </ToolBtn>
  )
}

// ── Assistência de IA ────────────────────────────────────────────────────────

function AiMenu({
  editor,
  onAssist,
}: {
  editor: Editor
  onAssist: (text: string, action: AiAction, target?: string) => Promise<string>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<AiAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Ação aguardando escolha de alvo (tom/idioma). Null = menu raiz.
  const [pendingTarget, setPendingTarget] = useState<AiAction | null>(null)
  // Guarda o HTML anterior para o "Desfazer IA" — a reescrita troca o documento
  // inteiro, e sem uma volta de um clique o usuário perde o texto original.
  const [previous, setPrevious] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  async function run(action: AiAction, target?: string) {
    const text = editor.getText().trim()
    if (!text) {
      setError("Escreva algo antes de pedir ajuda à IA.")
      return
    }
    setBusy(action)
    setError(null)
    try {
      const rewritten = await onAssist(text, action, target)
      setPrevious(editor.getHTML())
      // A IA devolve texto puro: converte para HTML preservando as quebras.
      editor.chain().focus().setContent(toHtml(rewritten)).run()
      setOpen(false)
      setPendingTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "A IA não conseguiu responder.")
    } finally {
      setBusy(null)
    }
  }

  function undo() {
    if (previous === null) return
    editor.chain().focus().setContent(previous).run()
    setPrevious(null)
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-0.5">
        {previous !== null && (
          <button
            type="button"
            onClick={undo}
            title="Desfazer a alteração da IA"
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-paper-500 transition-colors hover:bg-paper-100 hover:text-ink dark:hover:bg-ink-800 dark:hover:text-paper"
          >
            <X className="size-3" /> Desfazer IA
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cx(
            "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            open
              ? "bg-brand-50 text-brand-700"
              : "text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10",
          )}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          IA
          <ChevronDown className="size-3" />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-lg border border-paper-200 bg-white py-1 shadow-pop dark:border-ink-700 dark:bg-ink-800">
          {pendingTarget ? (
            <>
              <button
                type="button"
                onClick={() => setPendingTarget(null)}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] font-medium text-paper-500 transition-colors hover:bg-paper-100 dark:hover:bg-ink-700"
              >
                <ChevronDown className="size-3 rotate-90" />
                {AI_ACTIONS.find((a) => a.id === pendingTarget)?.label}
              </button>
              <div className="my-1 border-t border-paper-200 dark:border-ink-700" />
              {AI_TARGETS[pendingTarget].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run(pendingTarget, t.key)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-ink transition-colors hover:bg-paper-100 disabled:opacity-50 dark:text-paper dark:hover:bg-ink-700"
                >
                  {t.label}
                  {busy === pendingTarget && (
                    <Loader2 className="size-3 shrink-0 animate-spin text-brand-500" />
                  )}
                </button>
              ))}
            </>
          ) : (
            AI_ACTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  AI_TARGETS[item.id] ? setPendingTarget(item.id) : run(item.id)
                }
                className="flex w-full items-start justify-between gap-2 px-3 py-1.5 text-left transition-colors hover:bg-paper-100 disabled:opacity-50 dark:hover:bg-ink-700"
              >
                <span className="min-w-0">
                  <span className="block text-xs text-ink dark:text-paper">{item.label}</span>
                  <span className="block text-[10px] text-paper-500">{item.hint}</span>
                </span>
                {AI_TARGETS[item.id] ? (
                  <ChevronDown className="mt-0.5 size-3 shrink-0 -rotate-90 text-paper-400" />
                ) : (
                  busy === item.id && (
                    <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin text-brand-500" />
                  )
                )}
              </button>
            ))
          )}
          {error && (
            <p className="border-t border-paper-200 px-3 pb-1 pt-1.5 text-[11px] text-danger dark:border-ink-700">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Converte o texto puro da IA em HTML, preservando as quebras de linha — é o
// que carrega a estrutura quando ela devolve tópicos ou critérios de aceite.
export function toHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const lines = text.split("\n").filter((l) => l.trim())
  if (!lines.length) return ""

  const html: string[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) {
      html.push(`<ul>${list.map((li) => `<li><p>${li}</p></li>`).join("")}</ul>`)
      list = []
    }
  }
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    if (bullet) {
      list.push(escape(bullet[1]))
    } else {
      flush()
      html.push(`<p>${escape(line)}</p>`)
    }
  }
  flush()
  return html.join("")
}

function ToolBtn({
  active,
  onClick,
  disabled = false,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        "grid size-7 place-items-center rounded-md transition-colors",
        active
          ? "bg-brand-50 text-brand-700"
          : "text-paper-500 hover:bg-paper-100 hover:text-ink dark:hover:bg-ink-800 dark:hover:text-paper",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
      )}
    >
      {children}
    </button>
  )
}
