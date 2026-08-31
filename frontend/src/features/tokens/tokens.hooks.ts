import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as tokensApi from "./tokens.api"

export function useTokens() {
  return useQuery({ queryKey: ["personal-tokens"], queryFn: tokensApi.listTokens })
}

export function useCreateToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name?: string) => tokensApi.createToken(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal-tokens"] }),
  })
}

export function useRevokeToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tokensApi.revokeToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal-tokens"] }),
  })
}
