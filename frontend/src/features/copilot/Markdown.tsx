import { Fragment, type ReactNode } from "react"

/**
 * Renderizador de Markdown leve e seguro para as respostas do Copiloto.
 *
 * Cobre o subconjunto que a IA realmente usa: parágrafos, listas com marcador e
 * numeradas, **negrito**, *itálico* e `código` inline. Não usa
 * dangerouslySetInnerHTML — cada nó é um elemento React, então não há risco de XSS.
 */
export function Markdown({ text }: { text: string }) {
  return <div className="space-y-2">{renderBlocks(text)}</div>
}

type Block =
  | { type: "p"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }

function renderBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []

  for (const raw of lines) {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    const last = blocks[blocks.length - 1]

    if (bullet) {
      if (last?.type === "ul") last.items.push(bullet[1])
      else blocks.push({ type: "ul", items: [bullet[1]] })
    } else if (ordered) {
      if (last?.type === "ol") last.items.push(ordered[1])
      else blocks.push({ type: "ol", items: [ordered[1]] })
    } else if (line.trim() === "") {
      // Linha em branco encerra o bloco corrente.
      if (last?.type === "p") blocks.push({ type: "p", lines: [] })
    } else {
      if (last?.type === "p" && last.lines.length > 0) last.lines.push(line)
      else blocks.push({ type: "p", lines: [line] })
    }
  }

  return blocks
    .filter((b) => b.type !== "p" || b.lines.length > 0)
    .map((b, i) => {
      if (b.type === "ul")
        return (
          <ul key={i} className="list-disc space-y-0.5 pl-4">
            {b.items.map((it, j) => (
              <li key={j}>{renderInline(it)}</li>
            ))}
          </ul>
        )
      if (b.type === "ol")
        return (
          <ol key={i} className="list-decimal space-y-0.5 pl-4">
            {b.items.map((it, j) => (
              <li key={j}>{renderInline(it)}</li>
            ))}
          </ol>
        )
      return (
        <p key={i}>
          {b.lines.map((ln, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {renderInline(ln)}
            </Fragment>
          ))}
        </p>
      )
    })
}

// Tokeniza **negrito**, *itálico* e `código` inline.
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g

function renderInline(text: string): ReactNode[] {
  const parts = text.split(INLINE).filter(Boolean)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      )
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code
          key={i}
          className="rounded bg-ink/10 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/15"
        >
          {part.slice(1, -1)}
        </code>
      )
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>
    return <Fragment key={i}>{part}</Fragment>
  })
}
