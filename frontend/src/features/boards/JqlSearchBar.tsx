import { useState, useRef, useEffect } from "react"
import { Search, X } from "lucide-react"
import { useCardSearch } from "@/features/workspace/workspace.hooks"
import type { Card } from "@/features/workspace/workspace.types"

interface BoardSearchBarProps {
  projectId: string | null
  onResults: (cards: Card[] | null) => void
  // Query vinda de fora (chips de quick filter). Null limpa a busca.
  externalJql?: string | null
  // Notifica a busca atualmente aplicada (para "salvar filtro").
  onCommittedChange?: (jql: string) => void
}

// Converte texto livre digitado pelo usuário para a sintaxe interna aceita
// pelo backend (`text ~ "..."`) — o usuário nunca vê nem digita essa sintaxe.
function toQuery(term: string): string {
  const escaped = term.trim().replace(/"/g, '\\"')
  return `text ~ "${escaped}"`
}

export function JqlSearchBar({ projectId, onResults, externalJql, onCommittedChange }: BoardSearchBarProps) {
  const [raw, setRaw] = useState("")
  const [committed, setCommitted] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, error, isFetching } = useCardSearch(projectId, committed)

  useEffect(() => {
    if (!committed) {
      onResults(null)
      return
    }
    if (!isFetching && data !== undefined) {
      onResults(data)
    }
  }, [data, isFetching, committed, onResults])

  useEffect(() => {
    onCommittedChange?.(committed)
  }, [committed, onCommittedChange])

  // Chips de quick filter injetam a query aqui; null/"" limpa.
  useEffect(() => {
    if (externalJql === undefined) return
    if (externalJql === null || externalJql === "") {
      setRaw("")
      setCommitted("")
      onResults(null)
    } else {
      setRaw("")
      setCommitted(externalJql)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalJql])

  function handleChange(val: string) {
    setRaw(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) {
      setCommitted("")
      onResults(null)
      return
    }
    debounceRef.current = setTimeout(() => setCommitted(toQuery(val)), 400)
  }

  function clear() {
    setRaw("")
    setCommitted("")
    onResults(null)
  }

  return (
    <div className="relative flex items-center gap-2">
      <div className="relative flex items-center">
        <Search className="absolute left-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          data-board-search
          value={raw}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Buscar cards por título ou descrição"
          className="h-8 w-80 rounded-md border border-gray-200 bg-white dark:bg-ink-900 pl-8 pr-7 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {raw && (
          <button
            onClick={clear}
            className="absolute right-2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isFetching && committed && (
        <span className="text-xs text-gray-400">buscando…</span>
      )}
      {error && (
        <span className="text-xs text-red-500 max-w-xs truncate">Erro na busca</span>
      )}
      {data && committed && !isFetching && (
        <span className="text-xs text-gray-500">{data.length} resultado(s)</span>
      )}
    </div>
  )
}
