import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Github,
  LayoutGrid,
  Trash2,
} from "lucide-react"

import { cx } from "@/shared/ui/primitives"
import { GithubConnectRepo } from "./GithubConnectRepo"
import { getProjectDevMetrics, unlinkProjectRepo, type DevMetrics } from "./github.api"

const PR_TONE: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  merged: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  closed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
}

export function DevelopmentView({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["project-dev", projectId],
    queryFn: () => getProjectDevMetrics(projectId),
  })

  if (isLoading || !data)
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink/5 dark:bg-ink-800" />
        ))}
      </div>
    )

  if (data.repos.length === 0)
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-ink/15 bg-paper p-8 text-center dark:border-ink-700 dark:bg-ink-900">
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-ink text-paper dark:bg-paper dark:text-ink">
          <Github className="size-6" />
        </span>
        <h3 className="text-sm font-semibold text-ink dark:text-paper">
          Conecte o código ao projeto
        </h3>
        <p className="mx-auto mb-4 mt-1 max-w-xs text-xs text-paper-500">
          Vincule um repositório do GitHub para criar branches a partir dos cards e
          acompanhar commits e pull requests da equipe aqui.
        </p>
        <GithubConnectRepo projectId={projectId} />
      </div>
    )

  return (
    <div className="space-y-5">
      {/* Key metrics */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink dark:text-paper">Key metrics</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile icon={GitPullRequest} label="PRs abertos" value={data.prs.open} accent="emerald" />
          <Tile icon={GitPullRequest} label="PRs merged" value={data.prs.merged} accent="violet" />
          <Tile icon={GitBranch} label="Branches" value={data.branches} accent="sky" />
          <Tile icon={GitCommit} label="Commits" value={data.commits} accent="indigo" />
        </div>
      </div>

      {/* PR composition */}
      {data.prs.total > 0 && (
        <div className="rounded-2xl border border-ink/10 bg-paper p-5 dark:border-ink-700 dark:bg-ink-900">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ink dark:text-paper">Pull requests</h4>
            <span className="text-xs text-paper-400">{data.prs.total} no total</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-ink/5 dark:bg-ink-800">
            <Bar n={data.prs.open} total={data.prs.total} className="bg-emerald-500" />
            <Bar n={data.prs.merged} total={data.prs.total} className="bg-violet-500" />
            <Bar n={data.prs.closed} total={data.prs.total} className="bg-red-500" />
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-paper-500">
            <Legend swatch="bg-emerald-500" label={`${data.prs.open} abertos`} />
            <Legend swatch="bg-violet-500" label={`${data.prs.merged} merged`} />
            <Legend swatch="bg-red-500" label={`${data.prs.closed} fechados`} />
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Related work: pull requests */}
        <div className="rounded-2xl border border-ink/10 bg-paper p-5 lg:col-span-2 dark:border-ink-700 dark:bg-ink-900">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink dark:text-paper">
            <GitPullRequest className="size-4 text-violet-500" /> Pull requests recentes
          </h4>
          {data.recent_prs.length === 0 ? (
            <p className="py-6 text-center text-xs text-paper-400">
              Nenhum PR ligado ainda. Cite a ref do card (ex.: <span className="font-mono">PRJ-1</span>) no título ou branch do PR.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.recent_prs.map((pr) => (
                <li key={pr.id}>
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:border-ink-700 dark:hover:bg-ink-800"
                  >
                    <span className="min-w-0 flex-1 truncate text-ink dark:text-paper">
                      {pr.number ? <span className="text-paper-400">#{pr.number} </span> : null}
                      {pr.title}
                    </span>
                    {pr.state && (
                      <span className={cx("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", PR_TONE[pr.state] ?? "")}>
                        {pr.state === "merged" ? "Merged" : pr.state === "closed" ? "Fechado" : "Aberto"}
                      </span>
                    )}
                    {pr.author_login && (
                      <span className="shrink-0 text-[11px] text-paper-400">@{pr.author_login}</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Repositories */}
        <RepositoriesCard projectId={projectId} repos={data.repos} />
      </div>
    </div>
  )
}

function RepositoriesCard({ projectId, repos }: { projectId: string; repos: DevMetrics["repos"] }) {
  const qc = useQueryClient()
  const unlink = useMutation({
    mutationFn: (linkId: string) => unlinkProjectRepo(projectId, linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-dev", projectId] }),
  })
  return (
    <div className="rounded-2xl border border-ink/10 bg-paper p-5 dark:border-ink-700 dark:bg-ink-900">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink dark:text-paper">
        <LayoutGrid className="size-4 text-violet-500" /> Repositórios
      </h4>
      <ul className="space-y-2">
        {repos.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-xs dark:border-ink-700">
            <Github className="size-3.5 shrink-0 text-paper-400" />
            <span className="min-w-0 flex-1 truncate font-medium text-ink dark:text-paper">{r.full_name}</span>
            <span
              className={cx(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px]",
                r.webhook_active
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
              )}
              title={r.webhook_active ? "Webhook ativo — eventos em tempo real" : "Sem webhook — eventos não chegam"}
            >
              {r.webhook_active ? "sync" : "sem webhook"}
            </span>
            <button
              onClick={() => unlink.mutate(r.id)}
              disabled={unlink.isPending}
              className="shrink-0 rounded p-1 text-paper-400 transition-colors hover:text-red-600 disabled:opacity-40"
              title="Desvincular"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-ink/10 pt-3 dark:border-ink-700">
        <GithubConnectRepo projectId={projectId} />
      </div>
    </div>
  )
}

const ACCENTS: Record<string, string> = {
  emerald: "from-emerald-500 to-teal-600",
  violet: "from-violet-500 to-purple-600",
  sky: "from-sky-500 to-cyan-600",
  indigo: "from-indigo-500 to-blue-600",
}

function Tile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-paper p-4 dark:border-ink-700 dark:bg-ink-900">
      <span className={cx("grid size-8 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm", ACCENTS[accent])}>
        <Icon className="size-4" />
      </span>
      <div className="mt-3 text-2xl font-bold tabular-nums text-ink dark:text-paper">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-paper-500">{label}</div>
    </div>
  )
}

function Bar({ n, total, className }: { n: number; total: number; className: string }) {
  if (n === 0) return null
  return <div className={className} style={{ width: `${(n / total) * 100}%` }} />
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx("size-2.5 rounded-sm", swatch)} /> {label}
    </span>
  )
}
