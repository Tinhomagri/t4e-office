// Redes sociais — command center das contas conectadas.
//
// Conexão via OAuth oficial de cada plataforma (Instagram/Facebook via Meta,
// LinkedIn, X com PKCE, TikTok Login Kit, YouTube via Google); o backend guia o
// fluxo e guarda os tokens cifrados. Além de conectar, a tela responde as
// perguntas operacionais: algum token vai expirar? qual canal está parado?
// quanto cada conta publicou e alcançou nos últimos 30 dias?
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Eye,
  Link2,
  Plug,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  Unlink,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { CHANNEL_LABEL } from "@/features/boards/views/CalendarioView"
import {
  disconnectSocialAccount,
  listSocialAccounts,
  type SocialAccount,
} from "@/features/copilot/copilot.api"
import {
  type AccountHealth,
  type AccountHealthStatus,
  useAccountsHealth,
} from "@/features/integrations/insights.api"
import { connectInstagramWithToken, getOauthProviders, getOauthUrl } from "@/features/integrations/social.api"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { EASE } from "@/shared/lib/motion"
import {
  type CommandAction,
  MOD_LABEL,
  MetricStrip,
  MetricTile,
  Panel,
  SearchField,
  Sparkline,
  compactNumber,
  useCommandPalette,
  useHotkey,
} from "@/shared/ui/command-center"
import { Badge, Button, EmptyState, Input, Kbd, Modal, PageHeader, Skeleton, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"
import { isAxiosError } from "axios"

import { SocialAppConfigDialog } from "./SocialAppConfigDialog"
import { DriveConfigDialog } from "./DriveConfigDialog"

// Providers com fluxo OAuth implementado no backend
const PROVIDERS = ["instagram", "facebook", "linkedin", "x", "tiktok", "youtube"]
const PROVIDER_LABEL: Record<string, string> = {
  ...CHANNEL_LABEL,
  x: "X (Twitter)",
}

// Acento por canal — só o ponto de cor; o card em si segue neutro.
const CHANNEL_ACCENT: Record<string, string> = {
  instagram: "bg-red-400",
  facebook: "bg-brand-500",
  linkedin: "bg-brand-600",
  x: "bg-ink-700",
  tiktok: "bg-ink-600",
  youtube: "bg-red-500",
}

const HEALTH_META: Record<
  AccountHealthStatus,
  { label: string; tone: "success" | "warning" | "danger"; icon: typeof CheckCircle2 }
> = {
  healthy: { label: "Saudável", tone: "success", icon: CheckCircle2 },
  expiring: { label: "Token expirando", tone: "warning", icon: AlertTriangle },
  expired: { label: "Token expirado", tone: "danger", icon: ShieldAlert },
  disconnected: { label: "Sem token", tone: "danger", icon: ShieldAlert },
}

function relativeDays(iso: string | null): string {
  if (!iso) return "nunca publicou"
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (diff <= 0) return "hoje"
  if (diff === 1) return "ontem"
  if (diff < 30) return `há ${diff} dias`
  const months = Math.floor(diff / 30)
  return months === 1 ? "há 1 mês" : `há ${months} meses`
}

export function SocialAccountsPage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [params, setParams] = useSearchParams()
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [configured, setConfigured] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [driveConfigOpen, setDriveConfigOpen] = useState(false)
  const [instagramTokenOpen, setInstagramTokenOpen] = useState(false)
  const [instagramToken, setInstagramToken] = useState("")
  const [query, setQuery] = useState("")
  const [onlyIssues, setOnlyIssues] = useState(false)

  const health = useAccountsHealth(workspaceId, 30)

  const load = useCallback(() => {
    if (!workspaceId) return
    void listSocialAccounts(workspaceId)
      .then((r) => {
        setAccounts(r.accounts)
        setCanEdit(r.can_edit)
      })
      .catch(() => toast.error("Falha ao carregar contas."))
    void getOauthProviders(workspaceId).then(setConfigured).catch(() => setConfigured({}))
  }, [workspaceId])

  useEffect(() => {
    load()
  }, [load])

  // Resultado do callback OAuth (?social=connected|denied|error)
  useEffect(() => {
    const r = params.get("social")
    if (!r) return
    if (r === "connected") {
      const ch = params.get("channel") ?? ""
      toast.success(`${PROVIDER_LABEL[ch] ?? ch} conectado com sucesso.`)
    } else if (r === "denied") {
      toast.error("Autorização cancelada na plataforma.")
    } else {
      toast.error("Falha na conexão OAuth. Tente novamente.")
    }
    params.delete("social")
    params.delete("channel")
    setParams(params, { replace: true })
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const accountByChannel = useMemo(() => {
    const map: Record<string, SocialAccount> = {}
    for (const a of accounts) map[a.channel] = a
    return map
  }, [accounts])

  const healthByChannel = useMemo(() => {
    const map: Record<string, AccountHealth> = {}
    for (const entry of health.data?.accounts ?? []) map[entry.channel] = entry
    return map
  }, [health.data])

  const connect = useCallback(
    async (provider: string) => {
      if (!workspaceId) return
      if (provider === "instagram") {
        setInstagramToken("")
        setInstagramTokenOpen(true)
        return
      }
      setBusy(provider)
      try {
        const url = await getOauthUrl(provider, workspaceId, "/app/marketing/redes")
        window.location.href = url
      } catch {
        toast.error("Falha ao iniciar o OAuth (apenas admin; provider configurado?).")
        setBusy(null)
      }
    },
    [workspaceId],
  )

  const connectInstagramToken = async () => {
    if (!workspaceId || !instagramToken.trim()) {
      toast.error("Cole o token gerado pela Meta.")
      return
    }
    setBusy("instagram")
    try {
      await connectInstagramWithToken(workspaceId, instagramToken.trim())
      setInstagramToken("")
      setInstagramTokenOpen(false)
      load()
      void health.refetch()
      toast.success("Instagram conectado com sucesso.")
    } catch (error) {
      const detail = isAxiosError(error)
        ? (error.response?.data?.detail ?? error.response?.data?.message)
        : ""
      toast.error(detail || "Não foi possível validar o token do Instagram.")
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (ch: string) => {
    if (!workspaceId) return
    setBusy(ch)
    try {
      await disconnectSocialAccount(workspaceId, ch)
      load()
      void health.refetch()
      toast.success(`${PROVIDER_LABEL[ch] ?? ch} desconectado.`)
    } catch {
      toast.error("Falha ao desconectar.")
    } finally {
      setBusy(null)
    }
  }

  const refetchHealth = health.refetch
  const refreshAll = useCallback(() => {
    load()
    void refetchHealth()
  }, [load, refetchHealth])

  useHotkey("mod+r", refreshAll)

  // ── Agregados da barra de KPIs ────────────────────────────────────────────
  const entries = useMemo(() => health.data?.accounts ?? [], [health.data])
  const summary = useMemo(() => {
    const days = health.data?.days ?? 30
    return {
      connected: entries.length,
      attention: entries.filter((a) => a.status !== "healthy").length,
      published: entries.reduce((acc, a) => acc + a.posts.published, 0),
      scheduled: entries.reduce((acc, a) => acc + a.posts.scheduled, 0),
      failed: entries.reduce((acc, a) => acc + a.posts.failed, 0),
      impressions: entries.reduce((acc, a) => acc + a.impressions, 0),
      combined: Array.from({ length: days }, (_, i) =>
        entries.reduce((acc, a) => acc + (a.sparkline[i] ?? 0), 0),
      ),
    }
  }, [entries, health.data])

  const visibleProviders = useMemo(() => {
    const q = query.trim().toLowerCase()
    return PROVIDERS.filter((ch) => {
      const acc = accountByChannel[ch]
      const matches =
        !q ||
        (PROVIDER_LABEL[ch] ?? ch).toLowerCase().includes(q) ||
        (acc?.account_name ?? "").toLowerCase().includes(q)
      if (!matches) return false
      if (!onlyIssues) return true
      const h = healthByChannel[ch]
      return !acc || !h || h.status !== "healthy" || h.posts.failed > 0
    })
  }, [query, onlyIssues, accountByChannel, healthByChannel])

  const actions = useMemo<CommandAction[]>(() => {
    const list: CommandAction[] = [
      {
        id: "refresh",
        label: "Atualizar contas e métricas",
        icon: <RefreshCw className="size-4" />,
        shortcut: `${MOD_LABEL}R`,
        run: refreshAll,
      },
      {
        id: "queue",
        label: "Ir para a fila de publicação",
        icon: <Send className="size-4" />,
        run: () => navigate("/app/marketing/fila"),
      },
      {
        id: "calendar",
        label: "Ir para o calendário editorial",
        icon: <CalendarClock className="size-4" />,
        run: () => navigate("/app/marketing/calendario"),
      },
      {
        id: "issues",
        label: onlyIssues ? "Mostrar todos os canais" : "Mostrar só canais com problema",
        icon: <AlertTriangle className="size-4" />,
        run: () => setOnlyIssues((v) => !v),
      },
    ]
    if (canEdit) {
      list.push({
        id: "config",
        label: "Configurar apps OAuth",
        icon: <Settings className="size-4" />,
        run: () => setConfigOpen(true),
      })
      list.push({
        id: "drive-config",
        label: "Configurar biblioteca Google Drive",
        icon: <Settings className="size-4" />,
        run: () => setDriveConfigOpen(true),
      })
      for (const ch of PROVIDERS) {
        if (accountByChannel[ch]) continue
        list.push({
          id: `connect-${ch}`,
          label: `Conectar ${PROVIDER_LABEL[ch] ?? ch}`,
          group: "Conectar",
          icon: <Link2 className="size-4" />,
          hint: configured[ch] ? undefined : "app não configurado",
          run: () => void connect(ch),
        })
      }
    }
    return list
  }, [canEdit, configured, accountByChannel, onlyIssues, refreshAll, navigate, connect])

  const { palette, setOpen } = useCommandPalette(actions)

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
      {palette}

      <PageHeader
        eyebrow="Marketing"
        title="Redes sociais"
        subtitle="Contas conectadas pelo login oficial de cada plataforma, com saúde do token e volume publicado."
      >
        <Button
          variant="outline"
          size="sm"
          icon={<Plug className="size-3.5" />}
          onClick={() => setOpen(true)}
        >
          Comandos <Kbd>{MOD_LABEL}K</Kbd>
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw className="size-3.5" />}
          loading={health.isFetching}
          onClick={refreshAll}
        >
          Atualizar
        </Button>
        {canEdit && (
          <>
            <Button
              size="sm"
              icon={<Settings className="size-3.5" />}
              onClick={() => setConfigOpen(true)}
            >
              Configurar apps
            </Button>
            <Button variant="outline" size="sm" icon={<Settings className="size-3.5" />} onClick={() => setDriveConfigOpen(true)}>
              Google Drive
            </Button>
          </>
        )}
      </PageHeader>

      {workspaceId && (
        <>
          <SocialAppConfigDialog
            open={configOpen}
            onClose={() => setConfigOpen(false)}
            workspaceId={workspaceId}
            onSaved={load}
          />
          <DriveConfigDialog open={driveConfigOpen} onClose={() => setDriveConfigOpen(false)} workspaceId={workspaceId} />
          <Modal
            open={instagramTokenOpen}
            onClose={() => setInstagramTokenOpen(false)}
            title="Conectar Instagram"
            description="Na Meta, abra Instagram → Gerar token. Cole-o abaixo uma única vez; ele é cifrado e nunca será exibido novamente."
            footer={
              <>
                <Button type="button" variant="ghost" onClick={() => setInstagramTokenOpen(false)}>Cancelar</Button>
                <Button
                  type="button"
                  loading={busy === "instagram"}
                  onClick={(event) => {
                    event.preventDefault()
                    void connectInstagramToken()
                  }}
                >
                  Conectar
                </Button>
              </>
            }
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink dark:text-paper" htmlFor="instagram-access-token">Token de acesso do Instagram</label>
              <Input
                id="instagram-access-token"
                type="password"
                autoComplete="off"
                value={instagramToken}
                onChange={(event) => setInstagramToken(event.target.value)}
                placeholder="Cole o token gerado pela Meta"
              />
              <p className="text-xs text-paper-500">Não use a URL de callback de webhook: ela não é usada neste fluxo.</p>
            </div>
          </Modal>
        </>
      )}

      {!workspaceId ? (
        <EmptyState
          title="Selecione um workspace"
          description="As contas sociais são conectadas por workspace."
        />
      ) : (
        <>
          <MetricStrip>
            <MetricTile
              label="Contas conectadas"
              value={String(summary.connected)}
              rawValue={summary.connected}
              hint={`${PROVIDERS.length} plataformas suportadas`}
              icon={<Link2 className="size-3.5" />}
            />
            <MetricTile
              label="Precisam de atenção"
              value={String(summary.attention)}
              rawValue={summary.attention}
              tone={summary.attention > 0 ? "warning" : "neutral"}
              hint="Token expirado, expirando em até 7 dias ou conta sem token"
              icon={<ShieldAlert className="size-3.5" />}
              active={onlyIssues}
              onClick={() => setOnlyIssues((v) => !v)}
            />
            <MetricTile
              label="Publicados (30d)"
              value={String(summary.published)}
              rawValue={summary.published}
              spark={summary.combined}
              icon={<CheckCircle2 className="size-3.5" />}
            />
            <MetricTile
              label="Na fila"
              value={String(summary.scheduled)}
              rawValue={summary.scheduled}
              tone="brand"
              icon={<CalendarClock className="size-3.5" />}
              hint="Abrir a fila de publicação"
              onClick={() => navigate("/app/marketing/fila")}
            />
            <MetricTile
              label="Falhas"
              value={String(summary.failed)}
              rawValue={summary.failed}
              tone={summary.failed > 0 ? "danger" : "neutral"}
              icon={<AlertTriangle className="size-3.5" />}
              hint="Ver posts com falha na fila"
              onClick={() => navigate("/app/marketing/fila")}
            />
            <MetricTile
              label="Impressões (30d)"
              value={compactNumber(summary.impressions)}
              rawValue={summary.impressions}
              icon={<Eye className="size-3.5" />}
              hint="Abrir analytics social"
              onClick={() => navigate("/app/marketing/analytics")}
            />
          </MetricStrip>

          <Panel
            title="Canais"
            subtitle={`${visibleProviders.length} de ${PROVIDERS.length} plataformas`}
            actions={
              <div className="w-64">
                <SearchField value={query} onChange={setQuery} placeholder="Filtrar canal…" />
              </div>
            }
            bodyClassName="p-3"
          >
            {health.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {PROVIDERS.map((ch) => (
                  <Skeleton key={ch} className="h-40 rounded-lg" />
                ))}
              </div>
            ) : visibleProviders.length === 0 ? (
              <EmptyState
                title="Nenhum canal encontrado"
                description="Ajuste a busca ou desligue o filtro de problemas."
                className="border-0 bg-transparent py-10"
              />
            ) : (
              <motion.div
                className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                initial={reduce ? false : "hidden"}
                animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03 } } }}
              >
                <AnimatePresence mode="popLayout">
                  {visibleProviders.map((ch) => {
                    const acc = accountByChannel[ch]
                    const ready = configured[ch] ?? false
                    const h = healthByChannel[ch]
                    const meta = h ? HEALTH_META[h.status] : null
                    const HealthIcon = meta?.icon
                    return (
                      <motion.article
                        key={ch}
                        layout={!reduce}
                        variants={{
                          hidden: { opacity: 0, y: 6 },
                          show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE } },
                        }}
                        exit={{ opacity: 0, transition: { duration: 0.12 } }}
                        className="flex flex-col gap-3 rounded-lg border border-paper-200 bg-paper p-3 transition-[border-color,box-shadow] duration-150 hover:border-paper-300 hover:shadow-card dark:border-ink-700 dark:bg-ink-900 dark:hover:border-ink-600"
                      >
                        <header className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={cx(
                                "size-2 shrink-0 rounded-full",
                                CHANNEL_ACCENT[ch] ?? "bg-paper-400",
                              )}
                              aria-hidden="true"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-ink dark:text-paper">
                                {PROVIDER_LABEL[ch] ?? ch}
                              </p>
                              <p className="truncate text-[11px] text-paper-500">
                                {acc
                                  ? acc.account_name
                                  : ready
                                    ? "disponível para conectar"
                                    : "app não configurado"}
                              </p>
                            </div>
                          </div>
                          {acc && meta && HealthIcon ? (
                            <Badge tone={meta.tone}>
                              <HealthIcon className="size-3" />
                              {meta.label}
                            </Badge>
                          ) : (
                            <Badge tone={ready ? "neutral" : "warning"}>
                              {ready ? "não conectado" : "sem app"}
                            </Badge>
                          )}
                        </header>

                        {acc && h ? (
                          <>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              {(
                                [
                                  ["Publicados", h.posts.published, "text-ink dark:text-paper"],
                                  ["Na fila", h.posts.scheduled, "text-brand-600 dark:text-brand-300"],
                                  [
                                    "Falhas",
                                    h.posts.failed,
                                    h.posts.failed ? "text-danger" : "text-paper-400",
                                  ],
                                ] as const
                              ).map(([label, value, cls]) => (
                                <div key={label} className="rounded-md bg-paper-50 py-1.5 dark:bg-ink-800">
                                  <p className={cx("text-sm font-semibold tabular", cls)}>{value}</p>
                                  <p className="text-[10px] uppercase tracking-wide text-paper-500">
                                    {label}
                                  </p>
                                </div>
                              ))}
                            </div>

                            <div>
                              <div className="mb-0.5 flex items-baseline justify-between text-[11px] text-paper-500">
                                <span>Publicações · 30d</span>
                                <span className="tabular">{compactNumber(h.impressions)} impressões</span>
                              </div>
                              <Sparkline values={h.sparkline} height={26} />
                            </div>

                            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                              <dt className="text-paper-500">Última publicação</dt>
                              <dd className="text-right text-ink dark:text-paper">
                                {relativeDays(h.last_published_at)}
                              </dd>
                              <dt className="text-paper-500">Token</dt>
                              <dd
                                className={cx(
                                  "text-right",
                                  h.status === "healthy"
                                    ? "text-ink dark:text-paper"
                                    : h.status === "expiring"
                                      ? "text-warning"
                                      : "text-danger",
                                )}
                              >
                                {h.token_expires_in_days === null
                                  ? h.has_token
                                    ? "sem expiração"
                                    : "ausente"
                                  : h.token_expires_in_days < 0
                                    ? "expirado"
                                    : `expira em ${h.token_expires_in_days}d`}
                                {h.can_refresh && " · renovável"}
                              </dd>
                            </dl>

                            {canEdit && (
                              <div className="flex items-center gap-1.5 border-t border-paper-200 pt-2.5 dark:border-ink-700">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  icon={<RefreshCw className="size-3.5" />}
                                  loading={busy === ch}
                                  onClick={() => void connect(ch)}
                                >
                                  Reconectar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<Unlink className="size-3.5" />}
                                  loading={busy === ch}
                                  onClick={() => void disconnect(ch)}
                                  aria-label={`Desconectar ${PROVIDER_LABEL[ch] ?? ch}`}
                                />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex flex-1 flex-col justify-end gap-2">
                            <p className="text-[11px] text-paper-500">
                              {ready
                                ? "Conecte para agendar e medir publicações neste canal."
                                : "Cadastre o client_id e o secret do app antes de conectar."}
                            </p>
                            <Button
                              size="sm"
                              icon={<Link2 className="size-3.5" />}
                              loading={busy === ch}
                              disabled={!canEdit || !ready}
                              onClick={() => void connect(ch)}
                            >
                              Conectar
                            </Button>
                            {!ready && canEdit && (
                              <button
                                type="button"
                                onClick={() => setConfigOpen(true)}
                                className="rounded text-left text-[11px] text-brand-600 hover:underline focus-ring dark:text-brand-300"
                              >
                                Configurar app OAuth →
                              </button>
                            )}
                          </div>
                        )}
                      </motion.article>
                    )
                  })}
                </AnimatePresence>
              </motion.div>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}
