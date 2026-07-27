// Tela de conexão com a instância Chatwoot do workspace.
//
// Aparece quando ainda não há conexão (ou quando ela quebrou). Além do
// formulário, entrega a URL de webhook pronta para colar no Chatwoot — sem ela
// o tempo real não funciona e o usuário não teria como adivinhar o endereço.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useState } from "react"
import { AlertTriangle, CheckCircle2, Copy, Plug, RefreshCw, Trash2 } from "lucide-react"

import { Button, Field, Input, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

import { DUR } from "./inbox.motion"
import type { ChatwootConnection } from "./inbox.types"

interface Props {
  connection: ChatwootConnection | null
  onConnect: (input: { base_url: string; account_id: number; access_token?: string }) => void
  onTest: () => void
  onDisconnect: () => void
  saving: boolean
  testing: boolean
}

export function ConnectionSetup({
  connection,
  onConnect,
  onTest,
  onDisconnect,
  saving,
  testing,
}: Props) {
  const reduced = useReducedMotion()
  const [baseUrl, setBaseUrl] = useState(connection?.base_url ?? "https://app.chatwoot.com")
  const [accountId, setAccountId] = useState(String(connection?.account_id ?? ""))
  const [token, setToken] = useState("")

  const editing = Boolean(connection)
  const broken = connection?.status === "error"

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsedId = Number(accountId)
    if (!baseUrl.trim() || !parsedId) {
      toast.error("Preencha a URL e o ID da conta.")
      return
    }
    onConnect({
      base_url: baseUrl.trim(),
      account_id: parsedId,
      // Vazio na edição = o backend mantém o token já salvo.
      access_token: token.trim() || undefined,
    })
    setToken("")
  }

  async function copyWebhook() {
    if (!connection?.webhook_url) return
    await navigator.clipboard.writeText(connection.webhook_url)
    toast.success("URL do webhook copiada.")
  }

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.ui, ease: "easeOut" }}
      className="mx-auto w-full max-w-xl p-6"
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg bg-cw-500/10 text-cw-600 dark:text-cw-500">
          <Plug className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-cw-ink dark:text-paper">
            Conectar o Chatwoot
          </h2>
          <p className="text-[13px] text-cw-muted">
            O atendimento roda sobre a sua instância — nada é duplicado aqui.
          </p>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {broken && connection?.last_error && (
          <motion.p
            key="error"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.ui, ease: "easeOut" }}
            className="mb-4 flex items-start gap-2 overflow-hidden rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-semibold">A última verificação falhou:</strong>{" "}
              {connection.last_error}
            </span>
          </motion.p>
        )}

        {connection?.status === "connected" && (
          <motion.p
            key="ok"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.ui, ease: "easeOut" }}
            className="mb-4 flex items-center gap-2 overflow-hidden rounded-md border border-green-400/40 bg-green-50 px-3 py-2 text-[12px] text-green-700"
          >
            <CheckCircle2 className="size-4 shrink-0" />
            Conectada como <strong className="font-semibold">{connection.agent_name}</strong>
            {connection.agent_email && ` (${connection.agent_email})`}
          </motion.p>
        )}
      </AnimatePresence>

      <form onSubmit={submit} className="space-y-4">
        <Field label="URL da instância" hint="Ex.: https://app.chatwoot.com ou o seu domínio">
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://app.chatwoot.com"
            autoComplete="off"
          />
        </Field>

        <Field
          label="ID da conta"
          hint="O número que aparece na URL do Chatwoot: /app/accounts/<id>/"
        >
          <Input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value.replace(/\D/g, ""))}
            placeholder="1"
            inputMode="numeric"
          />
        </Field>

        <Field
          label={editing ? "Token de acesso (deixe vazio para manter)" : "Token de acesso"}
          hint="Perfil → Configurações → Token de acesso da API, no Chatwoot"
        >
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={connection?.has_token ? "••••••••••••" : "api_access_token"}
            autoComplete="off"
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={saving}>
            {editing ? "Salvar e revalidar" : "Conectar"}
          </Button>
          {editing && (
            <>
              <Button
                type="button"
                variant="outline"
                loading={testing}
                icon={<RefreshCw className="size-3.5" />}
                onClick={onTest}
              >
                Testar conexão
              </Button>
              <Button
                type="button"
                variant="ghost"
                icon={<Trash2 className="size-3.5" />}
                onClick={onDisconnect}
              >
                Desconectar
              </Button>
            </>
          )}
        </div>
      </form>

      {connection?.webhook_url && (
        <section className="mt-6 rounded-md border border-cw-border p-4 dark:border-ink-800">
          <div className="mb-1.5 flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-cw-ink dark:text-paper">
              Webhook (tempo real)
            </h3>
            <span className="rounded border border-cw-border px-1.5 py-0.5 text-[10px] font-medium text-cw-muted">
              Opcional, mas recomendado
            </span>
          </div>
          <p className="mb-2 text-[12px] text-cw-muted">
            No Chatwoot, vá em <strong>Configurações → Integrações → Webhooks</strong>, cole a
            URL abaixo e marque os eventos de conversa e mensagem. Sem isso a caixa só atualiza
            quando você recarrega.
          </p>
          <div className="flex items-center gap-2">
            <code
              className={cx(
                "min-w-0 flex-1 truncate rounded bg-cw-surface px-2.5 py-1.5 text-[11px] text-cw-ink",
                "dark:bg-ink-800 dark:text-paper",
              )}
            >
              {connection.webhook_url}
            </code>
            <Button
              variant="outline"
              size="sm"
              icon={<Copy className="size-3.5" />}
              onClick={() => void copyWebhook()}
            >
              Copiar
            </Button>
          </div>
        </section>
      )}
    </motion.div>
  )
}
