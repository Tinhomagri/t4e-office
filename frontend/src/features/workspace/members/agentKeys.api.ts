import { api } from "@/shared/api/client"

export interface AgentKey {
  id: string
  nome: string
  ativo: boolean
  criado_em: string
  ultimo_uso: string | null
  criado_por: string | null
}

/** Só a resposta da criação traz a chave — e só desta vez. */
export interface CreatedAgentKey extends AgentKey {
  chave: string
}

export async function listAgentKeys(workspaceId: string): Promise<AgentKey[]> {
  const { data } = await api.get<AgentKey[]>(`/workspaces/${workspaceId}/agent-keys/`)
  return data
}

export async function createAgentKey(workspaceId: string, nome: string): Promise<CreatedAgentKey> {
  const { data } = await api.post<CreatedAgentKey>(`/workspaces/${workspaceId}/agent-keys/`, { nome })
  return data
}

export async function revokeAgentKey(workspaceId: string, keyId: string): Promise<void> {
  await api.delete(`/workspaces/${workspaceId}/agent-keys/${keyId}/`)
}
