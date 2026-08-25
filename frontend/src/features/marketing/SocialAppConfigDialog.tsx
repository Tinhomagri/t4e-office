// Configuração dos apps OAuth por workspace: o dono cola Client ID/Secret de
// cada plataforma (Meta, LinkedIn, X, TikTok, Google) e o backend passa a usar
// essas credenciais no fluxo OAuth. O secret é cifrado no banco; nunca volta
// para o frontend (só o flag has_secret). A Redirect URI mostrada deve ser
// registrada no painel de cada provedor.
import { Copy, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import {
  deleteOauthCredential,
  getOauthCredentials,
  type OauthCredential,
  saveOauthCredential,
} from "@/features/integrations/social.api"
import { Button, Input, Modal } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

const PROVIDERS = ["instagram", "facebook", "linkedin", "x", "tiktok", "youtube"]
const LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X (Twitter)",
  tiktok: "TikTok",
  youtube: "YouTube",
}
// Onde criar o app OAuth de cada plataforma.
const CONSOLE_URL: Record<string, string> = {
  instagram: "https://developers.facebook.com/apps",
  facebook: "https://developers.facebook.com/apps",
  linkedin: "https://www.linkedin.com/developers/apps",
  x: "https://developer.x.com/en/portal/dashboard",
  tiktok: "https://developers.tiktok.com/apps",
  youtube: "https://console.cloud.google.com/apis/credentials",
}

export function SocialAppConfigDialog({
  open,
  onClose,
  workspaceId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  workspaceId: string
  onSaved?: () => void
}) {
  const [creds, setCreds] = useState<Record<string, OauthCredential>>({})
  const [drafts, setDrafts] = useState<Record<string, { id: string; secret: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    if (!workspaceId) return
    void getOauthCredentials(workspaceId)
      .then((c) => {
        setCreds(c)
        setDrafts(
          Object.fromEntries(
            PROVIDERS.map((p) => [p, { id: c[p]?.client_id ?? "", secret: "" }]),
          ),
        )
      })
      .catch(() => toast.error("Falha ao carregar credenciais (apenas o dono)."))
  }

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId])

  const save = async (provider: string) => {
    const d = drafts[provider] ?? { id: "", secret: "" }
    if (!d.id.trim()) {
      toast.error("Informe o Client ID.")
      return
    }
    if (!creds[provider]?.has_secret && !d.secret.trim()) {
      toast.error("Informe o Client Secret.")
      return
    }
    setBusy(provider)
    try {
      await saveOauthCredential(workspaceId, provider, d.id.trim(), d.secret.trim())
      toast.success(`${LABEL[provider]} configurado.`)
      load()
      onSaved?.()
    } catch {
      toast.error("Falha ao salvar (apenas o dono).")
    } finally {
      setBusy(null)
    }
  }

  const remove = async (provider: string) => {
    setBusy(provider)
    try {
      await deleteOauthCredential(workspaceId, provider)
      toast.success(`${LABEL[provider]} removido.`)
      load()
      onSaved?.()
    } catch {
      toast.error("Falha ao remover.")
    } finally {
      setBusy(null)
    }
  }

  const copyRedirect = (uri: string) => {
    void navigator.clipboard.writeText(uri)
    toast.success("Redirect URI copiada.")
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Configurar apps OAuth"
      description="Cole o Client ID e Secret do app de cada plataforma. O secret é cifrado no banco."
      footer={
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-4">
        {PROVIDERS.map((p) => {
          const c = creds[p]
          const d = drafts[p] ?? { id: "", secret: "" }
          const setD = (patch: Partial<{ id: string; secret: string }>) =>
            setDrafts((prev) => ({ ...prev, [p]: { ...d, ...patch } }))
          return (
            <div
              key={p}
              className="rounded-xl border border-paper-200 dark:border-ink-700 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink dark:text-paper">{LABEL[p]}</p>
                <span
                  className={
                    c?.source === "workspace"
                      ? "text-[10px] text-success"
                      : "text-[10px] text-warning"
                  }
                >
                  {c?.source === "workspace"
                    ? "configurado"
                      : "não configurado"}
                </span>
              </div>
              <Input
                value={d.id}
                onChange={(e) => setD({ id: e.target.value })}
                placeholder="Client ID"
              />
              <Input
                type="password"
                value={d.secret}
                onChange={(e) => setD({ secret: e.target.value })}
                placeholder={c?.has_secret ? "Client Secret (salvo — deixe vazio p/ manter)" : "Client Secret"}
              />
              {c?.redirect_uri && (
                <button
                  type="button"
                  onClick={() => copyRedirect(c.redirect_uri)}
                  className="flex w-full items-center gap-1.5 truncate text-left text-[11px] text-paper-400 hover:text-ink dark:hover:text-paper"
                  title="Registre esta Redirect URI no painel do provedor"
                >
                  <Copy className="size-3 shrink-0" />
                  <span className="truncate">{c.redirect_uri}</span>
                </button>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" loading={busy === p} onClick={() => save(p)}>
                  Salvar
                </Button>
                {c?.source === "workspace" && (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Trash2 className="size-3.5" />}
                    loading={busy === p}
                    onClick={() => remove(p)}
                  >
                    Remover
                  </Button>
                )}
                <a
                  href={CONSOLE_URL[p]}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-[11px] text-brand-600 hover:underline"
                >
                  Criar app ↗
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
