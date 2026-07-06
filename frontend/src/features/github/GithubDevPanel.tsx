import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { GitBranch, GitCommit, GitPullRequest, Github, Loader2 } from "lucide-react"
import { useState } from "react"

import { cx } from "@/shared/ui/primitives"
import { GithubConnectRepo } from "./GithubConnectRepo"
import { createCardBranch, getCardDevLinks, type DevLink } from "./github.api"

const PR_TONE: Record<string, string> = {
  open: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300",
  merged: "text-violet-600 bg-violet-100 dark:bg-violet-900/40 dark:text-violet-300",
  closed: "text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-300",
}

function errText(e: unknown): string {
  const anyE = e as { response?: { data?: { error?: string; detail?: string } } }
  return anyE?.response?.data?.error ?? anyE?.response?.data?.detail ?? "Falhou."
}

export function GithubDevPanel({ cardId, projectId }: { cardId: string; projectId: string }) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["card-dev-links", cardId],
    queryFn: () => getCardDevLinks(cardId),
  })

  const createBranch = useMutation({
    mutationFn: () => createCardBranch(cardId),
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: ["card-dev-links", cardId] })
    },
    onError: (e) => setError(errText(e)),
  })

  const links = data?.links ?? []
  const branches = links.filter((l) => l.kind === "branch")
  const commits = links.filter((l) => l.kind === "commit")
  const prs = links.filter((l) => l.kind === "pull_request")

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-paper">
          <Github className="size-4" /> Desenvolvimento
        </h3>
        {data?.repo_connected && (
          <button
            onClick={() => createBranch.mutate()}
            disabled={createBranch.isPending}
            className="flex items-center gap-1 rounded-lg bg-ink px-2.5 py-1 text-xs font-medium text-paper transition-colors hover:opacity-90 disabled:opacity-50 dark:bg-paper dark:text-ink"
          >
            {createBranch.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <><GitBranch className="size-3" /> Criar branch</>
            )}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="h-10 animate-pulse rounded-lg bg-ink/5 dark:bg-ink-800" />
      ) : !data?.repo_connected ? (
        <div className="rounded-lg border border-dashed border-ink/15 bg-paper-50 p-3 dark:border-ink-700 dark:bg-ink-900">
          <p className="mb-2 text-xs text-paper-500">
            Vincule um repositório do GitHub para criar branches a partir dos cards e ver
            commits e PRs aqui.
          </p>
          <GithubConnectRepo projectId={projectId} />
        </div>
      ) : links.length === 0 ? (
        <p className="text-xs text-paper-500">
          Sem branches, commits ou PRs ligados. Crie uma branch ou cite{" "}
          <span className="font-mono">a ref do card</span> num commit/PR.
        </p>
      ) : (
        <div className="space-y-3">
          <LinkGroup icon={GitBranch} label="Branches" items={branches} />
          <LinkGroup icon={GitPullRequest} label="Pull requests" items={prs} />
          <LinkGroup icon={GitCommit} label="Commits" items={commits} />
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  )
}

function LinkGroup({
  icon: Icon,
  label,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  items: DevLink[]
}) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-paper-400">
        <Icon className="size-3" /> {label} ({items.length})
      </p>
      <ul className="space-y-1">
        {items.map((l) => (
          <li key={l.id}>
            <a
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-ink/10 px-2.5 py-1.5 text-xs transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:border-ink-700 dark:hover:bg-ink-800"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-ink dark:text-paper">
                {l.title || l.branch || l.url}
              </span>
              {l.kind === "pull_request" && l.state && (
                <span className={cx("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", PR_TONE[l.state] ?? "")}>
                  {l.state === "merged" ? "Merged" : l.state === "closed" ? "Fechado" : "Aberto"}
                </span>
              )}
              {l.author_login && (
                <span className="shrink-0 text-[10px] text-paper-400">@{l.author_login}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
