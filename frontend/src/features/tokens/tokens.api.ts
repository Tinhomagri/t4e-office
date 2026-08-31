import { api } from "@/shared/api/client"

import type { PersonalToken, PersonalTokenCreated } from "./tokens.types"

export async function listTokens(): Promise<PersonalToken[]> {
  const { data } = await api.get<PersonalToken[]>("/auth/tokens/")
  return data
}

export async function createToken(name?: string): Promise<PersonalTokenCreated> {
  const { data } = await api.post<PersonalTokenCreated>("/auth/tokens/", { name: name ?? "" })
  return data
}

export async function revokeToken(id: string): Promise<void> {
  await api.delete(`/auth/tokens/${id}/`)
}
