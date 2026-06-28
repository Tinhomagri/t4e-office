import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Bold, Italic, List, ListOrdered } from "lucide-react"
import { useEffect } from "react"

import { cx } from "./primitives"

// Editor rich-text leve (Tiptap) para descrições e comentários de card.
// Emite HTML via onChange. Toolbar mínima: negrito, itálico, listas.
export function RichEditor({
  value,
  onChange,
  placeholder = "Escreva uma descrição…",
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "prose-sm min-h-[120px] max-w-none px-3 py-2.5 text-sm text-ink dark:text-paper focus:outline-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_p]:my-1",
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

  const isEmpty = editor.isEmpty

  return (
    <div className="rounded-xl border border-paper-300 bg-paper dark:bg-ink-900 transition-colors focus-within:border-brand-400">
      <div className="flex items-center gap-0.5 border-b border-paper-200 dark:border-ink-700 px-1.5 py-1">
        <ToolBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </ToolBtn>
        <div className="mx-1 h-4 w-px bg-paper-200 dark:bg-ink-700" />
        <ToolBtn
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" />
        </ToolBtn>
      </div>
      <div className="relative">
        {isEmpty && (
          <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-paper-400">
            {placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function ToolBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "grid size-7 place-items-center rounded-md transition-colors",
        active ? "bg-brand-50 text-brand-700" : "text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper",
      )}
    >
      {children}
    </button>
  )
}
