// Contas de rede social do workspace: conecta um @handle por canal. É a base
// para publicação — a chamada real à API do provider engata aqui (requer app
// OAuth aprovado pela Meta/LinkedIn, fora deste MVP).
import { Link2, Unlink } from "lucide-react"
import { useEffect, useState } from "react"
import {
  connectSocialAccount,
  disconnectSocialAccount,
  listSocialAccounts,
  type SocialAccount,
} from "@/features/copilot/copilot.api"
import { Button, Input, Modal } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"
import { CHANNEL_LABEL } from "./CalendarioView"

const CHANNELS = Object.keys(CHANNEL_LABEL).filter((c) => c !== "blog" && c !== "site")

export function SocialAccountsDialog({
  open,
  onClose,
  workspaceId,
}: {
  open: boolean
  onClose: () => void
  workspaceId: string
}) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = () =>
    listSocialAccounts(workspaceId)
      .then((r) => {
        setAccounts(r.accounts)
        setCanEdit(r.can_edit)
      })
      .catch(() => toast.error("Falha ao carregar contas."))

  useEffect(() => {
    if (open) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId])

  const byChannel = (ch: string) => accounts.find((a) => a.channel === ch)

  const connect = async (ch: string) => {
    const name = (drafts[ch] ?? "").trim()
    if (!name) return
    setBusy(ch)
    try {
      await connectSocialAccount(workspaceId, ch, name)
      await load()
      toast.success(`${CHANNEL_LABEL[ch]} conectado`)
    } catch {
      toast.error("Falha ao conectar (apenas admin).")
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (ch: string) => {
    setBusy(ch)
    try {
      await disconnectSocialAccount(workspaceId, ch)
      await load()
    } catch {
      toast.error("Falha ao desconectar.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Redes sociais"
      description="Conecte as contas do workspace. Publicação automática requer app aprovado pelo provedor."
      footer={
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-2">
        {CHANNELS.map((ch) => {
          const acc = byChannel(ch)
          return (
            <div
              key={ch}
              className="flex items-center gap-3 rounded-xl border border-paper-200 dark:border-ink-700 p-3"
            >
              <span className="w-24 shrink-0 text-sm font-medium text-ink dark:text-paper">
                {CHANNEL_LABEL[ch]}
              </span>
              {acc ? (
                <>
                  <span className="flex-1 truncate text-sm text-success">✓ {acc.account_name}</span>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Unlink className="size-4" />}
                      onClick={() => disconnect(ch)}
                      loading={busy === ch}
                    >
                      Desconectar
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Input
                    value={drafts[ch] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [ch]: e.target.value }))}
                    placeholder="@handle ou nome da página"
                    disabled={!canEdit}
                    className="flex-1"
                  />
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Link2 className="size-4" />}
                      onClick={() => connect(ch)}
                      loading={busy === ch}
                      disabled={!(drafts[ch] ?? "").trim()}
                    >
                      Conectar
                    </Button>
                  )}
                </>
              )}
            </div>
          )
        })}
        {!canEdit && (
          <p className="pt-1 text-xs text-paper-400">
            Somente administradores do workspace podem conectar contas.
          </p>
        )}
      </div>
    </Modal>
  )
}
