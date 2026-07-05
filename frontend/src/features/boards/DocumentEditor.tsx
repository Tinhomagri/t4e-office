// Editor de documento completo (estilo Google Docs/Word) para a aba
// Documentos do projeto. A folha é renderizada como uma página branca de
// verdade, centralizada num canvas cinza — não um textarea qualquer.
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import Image from "@tiptap/extension-image"
import Placeholder from "@tiptap/extension-placeholder"
import TaskItem from "@tiptap/extension-task-item"
import TaskList from "@tiptap/extension-task-list"
import TextAlign from "@tiptap/extension-text-align"
import { TextStyle } from "@tiptap/extension-text-style"
import Color from "@tiptap/extension-color"
import FontFamily from "@tiptap/extension-font-family"
import { Table } from "@tiptap/extension-table"
import TableRow from "@tiptap/extension-table-row"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import CharacterCount from "@tiptap/extension-character-count"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code,
  Combine,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link2,
  Link2Off,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Palette,
  Pilcrow,
  Quote,
  Redo2,
  Table as TableIcon,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { cx } from "@/shared/ui/primitives"

const FONT_FAMILIES = [
  { label: "Padrão", value: "" },
  { label: "Serifada", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monoespaçada", value: "'JetBrains Mono', ui-monospace, monospace" },
  { label: "Arredondada", value: "'Comic Sans MS', 'Segoe UI', sans-serif" },
]

const TEXT_COLORS = [
  "#111827", "#dc2626", "#ea580c", "#ca8a04",
  "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777",
]

const HIGHLIGHT_COLORS = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#e9d5ff"]

export function DocumentEditor({
  value,
  onChange,
  placeholder = "Comece a escrever… use a barra acima para inserir tabelas, listas e mais.",
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TextStyle,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      Image,
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CharacterCount,
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "prose-doc min-h-[297mm] max-w-none px-[76px] py-[76px] text-[15px] leading-relaxed text-ink focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Sincroniza quando o documento selecionado muda (troca de doc na sidebar)
  // ou quando chega uma versão nova do servidor (poll de outro membro do time).
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  if (!editor) return null

  const chars = editor.storage.characterCount?.characters() ?? 0
  const words = editor.storage.characterCount?.words() ?? 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-paper dark:bg-ink-900">
      <Toolbar editor={editor} />
      {/* Canvas cinza com a folha branca centralizada — visual de Word/Docs */}
      <div className="flex-1 overflow-y-auto scrollbar-slim bg-[#e9eaee] dark:bg-[#1a1a1f]">
        <div className="mx-auto my-8 w-[210mm] max-w-[calc(100%-2rem)] rounded-sm bg-white shadow-[0_1px_3px_rgba(0,0,0,0.15),0_8px_24px_-8px_rgba(0,0,0,0.25)]">
          <EditorContent editor={editor} />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-paper-100 dark:border-ink-800 px-4 py-2 text-[11px] text-paper-400">
        <span>{words} palavra{words !== 1 ? "s" : ""} · {chars} caractere{chars !== 1 ? "s" : ""}</span>
        <span>Salvo automaticamente</span>
      </div>
    </div>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [fontOpen, setFontOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const [highlightOpen, setHighlightOpen] = useState(false)

  const insertImage = () => {
    const url = window.prompt("URL da imagem:")
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  const currentFont = FONT_FAMILIES.find((f) => editor.isActive("textStyle", { fontFamily: f.value }))?.label
    ?? "Padrão"

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-2 py-1.5">
      <ToolBtn label="Desfazer" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo2 className="size-4" />
      </ToolBtn>
      <ToolBtn label="Refazer" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo2 className="size-4" />
      </ToolBtn>

      <Sep />

      <ToolBtn label="Parágrafo" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}>
        <Pilcrow className="size-4" />
      </ToolBtn>
      <ToolBtn label="Título 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="size-4" />
      </ToolBtn>
      <ToolBtn label="Título 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="size-4" />
      </ToolBtn>
      <ToolBtn label="Título 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="size-4" />
      </ToolBtn>

      <Sep />

      {/* Fonte */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setFontOpen((v) => !v)}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-paper-600 dark:text-paper-400 hover:bg-paper-100 dark:hover:bg-ink-800"
        >
          {currentFont} <ChevronDown className="size-3" />
        </button>
        {fontOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setFontOpen(false)} />
            <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 py-1 shadow-pop">
              {FONT_FAMILIES.map((f) => (
                <button
                  key={f.label}
                  onClick={() => {
                    if (f.value) editor.chain().focus().setFontFamily(f.value).run()
                    else editor.chain().focus().unsetFontFamily().run()
                    setFontOpen(false)
                  }}
                  style={{ fontFamily: f.value || undefined }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-sm text-ink dark:text-paper hover:bg-paper-100 dark:hover:bg-ink-700"
                >
                  {f.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <Sep />

      <ToolBtn label="Negrito" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" />
      </ToolBtn>
      <ToolBtn label="Itálico" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-4" />
      </ToolBtn>
      <ToolBtn label="Sublinhado" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="size-4" />
      </ToolBtn>
      <ToolBtn label="Código" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code className="size-4" />
      </ToolBtn>

      {/* Cor do texto */}
      <div className="relative">
        <ToolBtn label="Cor do texto" onClick={() => setColorOpen((v) => !v)}>
          <Palette className="size-4" />
        </ToolBtn>
        {colorOpen && (
          <ColorPopover
            colors={TEXT_COLORS}
            onPick={(c) => { editor.chain().focus().setColor(c).run(); setColorOpen(false) }}
            onClear={() => { editor.chain().focus().unsetColor().run(); setColorOpen(false) }}
            onClose={() => setColorOpen(false)}
          />
        )}
      </div>

      {/* Destacar */}
      <div className="relative">
        <ToolBtn label="Destacar" active={editor.isActive("highlight")} onClick={() => setHighlightOpen((v) => !v)}>
          <Highlighter className="size-4" />
        </ToolBtn>
        {highlightOpen && (
          <ColorPopover
            colors={HIGHLIGHT_COLORS}
            onPick={(c) => { editor.chain().focus().toggleHighlight({ color: c }).run(); setHighlightOpen(false) }}
            onClear={() => { editor.chain().focus().unsetHighlight().run(); setHighlightOpen(false) }}
            onClose={() => setHighlightOpen(false)}
          />
        )}
      </div>

      <Sep />

      <ToolBtn label="Alinhar à esquerda" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
        <AlignLeft className="size-4" />
      </ToolBtn>
      <ToolBtn label="Centralizar" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
        <AlignCenter className="size-4" />
      </ToolBtn>
      <ToolBtn label="Alinhar à direita" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
        <AlignRight className="size-4" />
      </ToolBtn>

      <Sep />

      <ToolBtn label="Lista com marcadores" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="size-4" />
      </ToolBtn>
      <ToolBtn label="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </ToolBtn>
      <ToolBtn label="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks className="size-4" />
      </ToolBtn>
      <ToolBtn label="Citação" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </ToolBtn>
      <ToolBtn label="Bloco de código" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <Code className="size-4" />
      </ToolBtn>
      <ToolBtn label="Linha horizontal" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="size-4" />
      </ToolBtn>

      <Sep />

      <div className="relative">
        <ToolBtn
          label="Link"
          active={editor.isActive("link")}
          onClick={() => setLinkOpen((v) => !v)}
        >
          <Link2 className="size-4" />
        </ToolBtn>
        {linkOpen && (
          <LinkPopover
            editor={editor}
            onClose={() => setLinkOpen(false)}
          />
        )}
      </div>
      {editor.isActive("link") && (
        <ToolBtn label="Remover link" onClick={() => editor.chain().focus().unsetLink().run()}>
          <Link2Off className="size-4" />
        </ToolBtn>
      )}
      <ToolBtn label="Inserir imagem" onClick={insertImage}>
        <ImageIcon className="size-4" />
      </ToolBtn>
      <ToolBtn label="Inserir tabela" onClick={insertTable}>
        <TableIcon className="size-4" />
      </ToolBtn>
      {editor.isActive("table") && (
        <ToolBtn label="Excluir tabela" onClick={() => editor.chain().focus().deleteTable().run()}>
          <Trash2 className="size-4" />
        </ToolBtn>
      )}

      <Sep />

      <ToolBtn label="Limpar formatação" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
        <Combine className="size-4" />
      </ToolBtn>
    </div>
  )
}

function ColorPopover({
  colors,
  onPick,
  onClear,
  onClose,
}: {
  colors: string[]
  onPick: (color: string) => void
  onClear: () => void
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute left-0 top-full z-20 mt-1 flex w-40 flex-wrap gap-1.5 rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 p-2.5 shadow-pop">
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            style={{ backgroundColor: c }}
            className="size-6 rounded-full border border-black/10 transition-transform hover:scale-110"
            title={c}
          />
        ))}
        <button
          onClick={onClear}
          className="grid size-6 place-items-center rounded-full border border-paper-300 dark:border-ink-600 text-[10px] text-paper-400 hover:border-danger hover:text-danger"
          title="Remover cor"
        >
          ×
        </button>
      </div>
    </>
  )
}

function LinkPopover({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState(editor.getAttributes("link").href ?? "")

  const apply = () => {
    const trimmed = url.trim()
    if (trimmed) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run()
    }
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute left-0 top-full z-20 mt-1 flex w-64 items-center gap-1.5 rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 p-2 shadow-pop">
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply()
            if (e.key === "Escape") onClose()
          }}
          placeholder="https://…"
          className="min-w-0 flex-1 rounded border border-paper-300 dark:border-ink-600 bg-transparent px-2 py-1 text-xs text-ink dark:text-paper outline-none focus:border-brand-400"
        />
        <button
          onClick={apply}
          className="shrink-0 rounded bg-brand-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-brand-600"
        >
          OK
        </button>
      </div>
    </>
  )
}

function Sep() {
  return <div className="mx-1 h-4 w-px shrink-0 bg-paper-200 dark:bg-ink-700" />
}

function ToolBtn({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "grid size-7 shrink-0 place-items-center rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none",
        active
          ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
          : "text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper",
      )}
    >
      {children}
    </button>
  )
}
