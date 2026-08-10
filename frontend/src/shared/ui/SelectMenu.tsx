import { Check, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { cx } from "./primitives"

/**
 * Menu de seleção com aparência própria.
 *
 * Existe porque `<select>` nativo delega o menu ao sistema operacional: ele
 * ignora tokens, tema escuro e não aceita avatar nem cor ao lado do item — é o
 * que fazia a edição inline da lista destoar do resto do app. Aqui o gatilho é
 * livre (um badge, um avatar) e o menu é nosso.
 *
 * Teclado: setas navegam, Enter escolhe, Esc fecha, digitar filtra quando
 * `searchable`. Foco volta ao gatilho ao fechar — sem isso a navegação por
 * teclado se perde no fim da página.
 */
export interface SelectOption {
  value: string
  label: string
  /** Enfeite à esquerda do rótulo: ponto de cor, avatar, ícone. */
  adornment?: React.ReactNode
}

export function SelectMenu({
  value,
  options,
  onChange,
  children,
  searchable = false,
  align = "left",
  label,
}: {
  value: string
  options: SelectOption[]
  onChange: (v: string) => void
  /** Gatilho: o que já é mostrado na célula (badge, avatar, texto). */
  children: React.ReactNode
  searchable?: boolean
  align?: "left" | "right"
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open])

  // Abre já com o item atual destacado — não no topo da lista.
  useEffect(() => {
    if (!open) return
    setQuery("")
    setActive(Math.max(options.findIndex((o) => o.value === value), 0))
  }, [open, options, value])

  // Mantém o item ativo à vista ao navegar por teclado numa lista longa.
  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" })
  }, [active, open])

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const pick = (v: string) => {
    onChange(v)
    close()
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter") {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="inline-flex max-w-full items-center rounded-md outline-none transition-shadow hover:ring-2 hover:ring-paper-200 focus-visible:ring-2 focus-visible:ring-brand-400 dark:hover:ring-ink-700"
      >
        {children}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              close()
            } else if (e.key === "ArrowDown") {
              e.preventDefault()
              setActive((i) => Math.min(i + 1, filtered.length - 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === "Enter" && filtered[active]) {
              e.preventDefault()
              pick(filtered[active].value)
            }
          }}
          className={cx(
            "absolute top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-paper-200 bg-paper py-1 shadow-pop dark:border-ink-700 dark:bg-ink-750",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {searchable && (
            <div className="relative mb-1 px-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-paper-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                placeholder="Buscar…"
                className="w-full rounded-lg border border-paper-200 bg-paper-50 py-1.5 pl-7 pr-2 text-xs outline-none focus:border-brand-400 dark:border-ink-700 dark:bg-ink-800"
              />
            </div>
          )}

          <div ref={listRef} className="max-h-60 overflow-y-auto scrollbar-slim">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-paper-400">
                Nada encontrado.
              </p>
            ) : (
              filtered.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  data-active={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o.value)}
                  className={cx(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] transition-colors",
                    i === active
                      ? "bg-paper-100 dark:bg-ink-800"
                      : "hover:bg-paper-50 dark:hover:bg-ink-800/60",
                  )}
                >
                  {o.adornment}
                  <span className="min-w-0 flex-1 truncate text-ink dark:text-ink-200">
                    {o.label}
                  </span>
                  {o.value === value && (
                    <Check className="size-3.5 shrink-0 text-brand-500" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
