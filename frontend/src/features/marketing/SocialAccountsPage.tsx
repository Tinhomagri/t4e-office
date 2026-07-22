// Página de redes sociais — conexão via OAuth oficial de cada plataforma
// (Instagram/Facebook via Meta, LinkedIn, X com PKCE, TikTok Login Kit,
// YouTube via Google). O backend guia o fluxo e guarda tokens cifrados.
import { Link2, Settings, Unlink } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { CHANNEL_LABEL } from "@/features/boards/views/CalendarioView"
import {
  disconnectSocialAccount,
  listSocialAccounts,
  type SocialAccount,
} from "@/features/copilot/copilot.api"
import { getOauthProviders, getOauthUrl } from "@/features/integrations/social.api"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { Button, PageHeader, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"
import { SocialAppConfigDialog } from "./SocialAppConfigDialog"

// Providers com fluxo OAuth implementado no backend
const PROVIDERS = ["instagram", "facebook", "linkedin", "x", "tiktok", "youtube"]
const PROVIDER_LABEL: Record<string, string> = {
  ...CHANNEL_LABEL,
  x: "X (Twitter)",
}

export function SocialAccountsPage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const [params, setParams] = useSearchParams()
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [configured, setConfigured] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)

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

  const byChannel = (ch: string) => accounts.find((a) => a.channel === ch)

  const connect = async (provider: string) => {
    if (!workspaceId) return
    setBusy(provider)
    try {
      const url = await getOauthUrl(provider, workspaceId, "/app/marketing/redes")
      window.location.href = url
    } catch {
      toast.error("Falha ao iniciar o OAuth (apenas admin; provider configurado?).")
      setBusy(null)
    }
  }

  const disconnect = async (ch: string) => {
    if (!workspaceId) return
    setBusy(ch)
    try {
      await disconnectSocialAccount(workspaceId, ch)
      load()
      toast.success(`${PROVIDER_LABEL[ch] ?? ch} desconectado.`)
    } catch {
      toast.error("Falha ao desconectar.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        eyebrow="Marketing"
        title="Redes sociais"
        subtitle="Conecte as contas do workspace pelo login oficial de cada plataforma."
      >
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            icon={<Settings className="size-3.5" />}
            onClick={() => setConfigOpen(true)}
          >
            Configurar apps
          </Button>
        )}
      </PageHeader>
      {workspaceId && (
        <SocialAppConfigDialog
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          workspaceId={workspaceId}
          onSaved={load}
        />
      )}
      {!workspaceId ? (
        <p className="text-sm text-paper-400">Selecione um workspace.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {PROVIDERS.map((ch) => {
            const acc = byChannel(ch)
            const ready = configured[ch] ?? false
            return (
              <div
                key={ch}
                className="rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-900 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink dark:text-paper">
                    {PROVIDER_LABEL[ch] ?? ch}
                  </p>
                  <span
                    className={cx(
                      "text-[10px] font-medium",
                      acc ? "text-success" : ready ? "text-paper-400" : "text-warning",
                    )}
                  >
                    {acc ? "conectado" : ready ? "disponível" : "não configurado"}
                  </span>
                </div>
                {acc ? (
                  <div className="mt-2 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm text-paper-500">
                      {acc.account_name}
                    </p>
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Unlink className="size-3.5" />}
                        loading={busy === ch}
                        onClick={() => disconnect(ch)}
                      >
                        Desconectar
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    <Button
                      size="sm"
                      icon={<Link2 className="size-3.5" />}
                      loading={busy === ch}
                      disabled={!canEdit || !ready}
                      onClick={() => connect(ch)}
                    >
                      Conectar com {PROVIDER_LABEL[ch] ?? ch}
                    </Button>
                    {!ready && (
                      <button
                        type="button"
                        onClick={() => setConfigOpen(true)}
                        className="text-[11px] text-brand-600 hover:underline"
                      >
                        Configurar app OAuth →
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
