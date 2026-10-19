import { useState } from "react"
import { Copy, KeyRound, ShieldAlert } from "lucide-react"

import { Button, EmptyState, Field, Input, Modal, Spinner } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

import type { AgentKey } from "./agentKeys.api"
import { useAgentKeys, useCreateAgentKey, useRevokeAgentKey } from "./agentKeys.hooks"
import { Panel } from "./shared"

const API_BASE = "https://office.t4egroup.com.br/api/agentes/v1/"

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Chaves de API para os agentes (só leitura). Só dono/admin vê. A chave é
 * mostrada UMA vez, logo depois de gerada — o Office guarda só o hash, então
 * nem o admin consegue vê-la de novo; perdeu, revoga e gera outra.
 */
export function AgentKeysTab({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const keys = useAgentKeys(workspaceId, canManage)
  const createKey = useCreateAgentKey(workspaceId)
  const revokeKey = useRevokeAgentKey(workspaceId)
  const [nome, setNome] = useState("")
  // A chave em texto só vive neste estado, enquanto o diálogo está aberto.
  const [created, setCreated] = useState<{ nome: string; chave: string } | null>(null)
  const [revoking, setRevoking] = useState<AgentKey | null>(null)

  if (!canManage) {
    return (
      <EmptyState
        title="Acesso restrito"
        description="Apenas dono ou administrador do workspace gerenciam chaves de API."
      />
    )
  }

  const generate = () => {
    const value = nome.trim()
    if (!value) return
    createKey.mutate(value, {
      onSuccess: (key) => {
        setCreated({ nome: key.nome, chave: key.chave })
        setNome("")
      },
      onError: () => toast.error("Não foi possível gerar a chave"),
    })
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Chave copiada")
    } catch {
      toast.error("Não foi possível copiar — selecione e copie manualmente")
    }
  }

  return (
    <div className="space-y-4">
      <Panel className="space-y-3 p-4">
        <div>
          <h3 className="text-sm font-semibold text-ink dark:text-paper">Gerar chave de API</h3>
          <p className="mt-0.5 text-xs text-paper-500">
            Para integrações externas (ex.: os agentes de IA) lerem projetos, cards, horas e
            sprints. Acesso <strong>somente leitura</strong>, auditado, até 60 requisições por
            minuto. API em <code className="text-[11px]">{API_BASE}</code>.
          </p>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            generate()
          }}
        >
          <div className="min-w-[240px] flex-1">
            <Field label="Nome da chave">
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Leonardo – saúde das squads"
                maxLength={120}
              />
            </Field>
          </div>
          <Button
            type="submit"
            icon={<KeyRound className="size-4" />}
            disabled={!nome.trim()}
            loading={createKey.isPending}
          >
            Gerar chave
          </Button>
        </form>
      </Panel>

      {keys.isLoading ? (
        <div className="grid place-items-center py-10">
          <Spinner />
        </div>
      ) : (keys.data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma chave" description="As chaves geradas aparecem aqui." />
      ) : (
        <Panel className="p-2">
          <ul className="divide-y divide-ink/5 dark:divide-ink-700">
            {(keys.data ?? []).map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <KeyRound className="size-4 shrink-0 text-paper-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink dark:text-paper">{k.nome}</span>
                    {!k.ativo && (
                      <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[10px] font-semibold text-paper-500 dark:bg-ink-800">
                        Revogada
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-paper-500">
                    Criada em {fmt(k.criado_em)}
                    {k.criado_por && ` por ${k.criado_por}`} ·{" "}
                    {k.ultimo_uso ? `último uso ${fmt(k.ultimo_uso)}` : "nunca usada"}
                  </p>
                </div>
                {k.ativo && (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Revogar ${k.nome}`}
                    onClick={() => setRevoking(k)}
                  >
                    Revogar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {created && (
        <Modal
          open
          // Fechar pelo X ou pelo fundo também descarta: a chave não volta.
          onClose={() => setCreated(null)}
          title={`Chave gerada: ${created.nome}`}
          footer={
            <>
              <Button variant="ghost" icon={<Copy className="size-4" />} onClick={() => copy(created.chave)}>
                Copiar
              </Button>
              <Button onClick={() => setCreated(null)}>Já copiei</Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-200">
              <ShieldAlert className="size-4 shrink-0" />
              <span>
                Copie agora: esta chave <strong>não será mostrada de novo</strong>. Envie por um
                canal seguro (gerenciador de senhas), nunca por WhatsApp ou e-mail em texto. Se
                perder, revogue e gere outra.
              </span>
            </div>
            <Input
              readOnly
              value={created.chave}
              aria-label="Chave de API"
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <p className="text-xs text-paper-500">
              Uso: header <code>Authorization: Bearer &lt;chave&gt;</code> em {API_BASE}
            </p>
          </div>
        </Modal>
      )}

      {revoking && (
        <Modal
          open
          onClose={() => setRevoking(null)}
          title={`Revogar "${revoking.nome}"?`}
          description="Quem usa esta chave perde o acesso na hora. Não dá para desfazer."
          footer={
            <>
              <Button variant="ghost" onClick={() => setRevoking(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                loading={revokeKey.isPending}
                onClick={() =>
                  revokeKey.mutate(revoking.id, {
                    onSuccess: () => {
                      toast.success("Chave revogada")
                      setRevoking(null)
                    },
                    onError: () => toast.error("Não foi possível revogar"),
                  })
                }
              >
                Revogar chave
              </Button>
            </>
          }
        >
          <p className="text-sm text-paper-500">
            A chave continua listada como revogada, para a auditoria.
          </p>
        </Modal>
      )}
    </div>
  )
}
