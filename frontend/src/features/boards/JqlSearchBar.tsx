import { useState, useRef, useEffect } from "react"
import { Search, X, ChevronDown } from "lucide-react"
import { useCardSearch } from "@/features/workspace/workspace.hooks"
import type { Card } from "@/features/workspace/workspace.types"

interface JqlSearchBarProps {
  projectId: string | null
  onResults: (cards: Card[] | null) => void
}

const QUICK_FILTERS = [
  { label: "Em andamento", jql: 'status = doing' },
  { label: "Alta prioridade", jql: 'priority = high' },
  { label: "Urgente", jql: 'priority = urgent' },
  { label: "Atribuído a mim", jql: 'assignee = me' },
  { label: "Sprint ativo", jql: 'sprint = active' },
  { label: "Bugs", jql: 'type = bug' },
]

export function JqlSearchBar({ projectId, onResults }: JqlSearchBarProps) {
  const [raw, setRaw] = useState("")
  const [committed, setCommitted] = useState("")
  const [showQuick, setShowQuick] = useState(false)
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

  function submit(jql: string) {
    setRaw(jql)
    setCommitted(jql)
    setShowQuick(false)
  }

  function handleChange(val: string) {
    setRaw(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) {
      setCommitted("")
      onResults(null)
      return
    }
    debounceRef.current = setTimeout(() => setCommitted(val), 600)
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
          data-jql-search
          value={raw}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit(raw)}
          placeholder='Buscar JQL: status = todo AND priority = high'
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

      <button
        onClick={() => setShowQuick((v) => !v)}
        className="flex items-center gap-1 rounded-md border border-gray-200 bg-white dark:bg-ink-900 px-2.5 h-8 text-xs text-gray-600 hover:bg-gray-50"
      >
        Filtros <ChevronDown className="h-3 w-3" />
      </button>

      {showQuick && (
        <div className="absolute top-10 left-0 z-50 w-56 rounded-lg border border-gray-200 bg-white dark:bg-ink-900 shadow-lg">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.jql}
              onClick={() => submit(f.jql)}
              className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
            >
              {f.label}
              <span className="ml-2 font-mono text-[10px] text-gray-400">{f.jql}</span>
            </button>
          ))}
        </div>
      )}

      {isFetching && committed && (
        <span className="text-xs text-gray-400">buscando…</span>
      )}
      {error && (
        <span className="text-xs text-red-500 max-w-xs truncate">
          {(error as { message?: string }).message ?? "Erro JQL"}
        </span>
      )}
      {data && committed && !isFetching && (
        <span className="text-xs text-gray-500">{data.length} resultado(s)</span>
      )}
    </div>
  )
}
