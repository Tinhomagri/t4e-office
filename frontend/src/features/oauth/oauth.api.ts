import { api } from "@/shared/api/client"

export interface OAuthClientInfo {
  client_id: string
  client_name: string
  redirect_uris: string[]
}

export async function getOAuthClient(clientId: string): Promise<OAuthClientInfo> {
  const { data } = await api.get<OAuthClientInfo>(`/oauth/clients/${clientId}/`)
  return data
}

export async function createAuthorizationCode(
  clientId: string,
  redirectUri: string,
): Promise<{ code: string }> {
  const { data } = await api.post<{ code: string }>("/oauth/authorize-code/", {
    client_id: clientId,
    redirect_uri: redirectUri,
  })
  return data
}
