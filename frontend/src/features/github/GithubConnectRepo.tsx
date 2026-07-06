import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Github, Loader2 } from "lucide-react"
import { useState } from "react"

import {
  getGithubAuthUrl,
  getGithubStatus,
  linkProjectRepo,
  listMyRepos,
} from "./github.api"

/**
 * Fluxo de conexão do GitHub a um projeto: conecta a conta (OAuth) e vincula um
 * repositório. Usado no estado vazio do painel de desenvolvimento (admins).
 */
export function GithubConnectRepo({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { data: statusData } = useQuery({
    queryKey: ["github-status"],
    queryFn: getGithubStatus,
  })
  const connected = !!statusData?.connected

  const { data: repos, isLoading: loadingRepos } = useQuery({
    queryKey: ["github-repos"],
    queryFn: listMyRepos,
    enabled: connected,
  })

  const connect = useMutation({
    mutationFn: () => getGithubAuthUrl(window.location.pathname),
    onSuccess: (url) => {
      window.location.href = url
    },
    onError: () => setError("Não foi possível iniciar a conexão com o GitHub."),
  })

  const link = useMutation({
    mutationFn: (fullName: string) => linkProjectRepo(projectId, fullName),
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: ["card-dev-links"] })
      qc.invalidateQueries({ queryKey: ["project-repos", projectId] })
    },
    onError: (e) => {
      const anyE = e as { response?: { data?: { error?: string; detail?: string } } }
      setError(anyE?.response?.data?.error ?? anyE?.response?.data?.detail ?? "Falha ao vincular.")
    },
  })

  if (!connected)
    return (
      <div className="space-y-2">
        <button
          onClick={() => connect.mutate()}
          disabled={connect.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-paper transition-colors hover:opacity-90 disabled:opacity-50 dark:bg-paper dark:text-ink"
        >
          {connect.isPending ? <Loader2 className="size-4 animate-spin" /> : <Github className="size-4" />}
          Conectar GitHub
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    )

  return (
    <div className="space-y-2">
      <p className="text-xs text-paper-500">
        Conectado como <span className="font-medium">@{statusData?.login}</span>. Escolha o
        repositório deste projeto:
      </p>
      {loadingRepos ? (
        <div className="h-9 animate-pulse rounded-lg bg-ink/5 dark:bg-ink-800" />
      ) : (
        <select
          defaultValue=""
          disabled={link.isPending}
          onChange={(e) => e.target.value && link.mutate(e.target.value)}
          className="w-full rounded-lg border border-ink/15 bg-paper-100 px-3 py-2 text-sm dark:bg-ink-800"
        >
          <option value="">Selecione um repositório…</option>
          {(repos ?? []).map((r) => (
            <option key={r.full_name} value={r.full_name}>
              {r.full_name}
              {r.private ? " (privado)" : ""}
            </option>
          ))}
        </select>
      )}
      {link.isPending && (
        <p className="flex items-center gap-1.5 text-xs text-paper-500">
          <Loader2 className="size-3 animate-spin" /> Vinculando e registrando webhook…
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
