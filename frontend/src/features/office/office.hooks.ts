import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { PresenceStatus } from "@/features/workspace/workspace.types"

import * as officeApi from "./office.api"
import type { HeartbeatInput } from "./office.types"

// Sala em tempo (quase) real: poll a cada 1s. A suavização do movimento é
// feita no cliente (transição CSS entre amostras).
export function useRoom(workspaceId: string | null, floor: number) {
  return useQuery({
    // O andar entra na queryKey: sem isso, ao trocar de andar aparece por um
    // instante o cache da sala do andar anterior.
    queryKey: ["office-room", workspaceId, floor],
    queryFn: () => officeApi.getRoom(workspaceId!, floor),
    enabled: !!workspaceId,
    // 600ms: com a posição sendo publicada a cada 150ms durante o movimento, o
    // poll passa a ser o gargalo. Menos que isso não melhora a percepção — a
    // interpolação do cliente já cobre o intervalo entre amostras.
    refetchInterval: 600,
    // Aba oculta não faz poll (não há o que desenhar), mas ao voltar o foco a
    // sala é buscada na hora: sem isso a cena reaparecia com o último estado
    // conhecido, que podia ser de minutos antes.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    // A amostra vale pelo intervalo do poll; marcá-la como fresca só faria o
    // React Query servir cache velho ao remontar a cena (troca de andar).
    staleTime: 0,
  })
}

export function useDeliveryChampion(workspaceId: string | null) {
  return useQuery({
    queryKey: ["office-delivery-champion", workspaceId],
    queryFn: () => officeApi.getDeliveryChampion(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}

export function useHeartbeat() {
  // Best-effort: falhas de heartbeat não devem virar toast/erro.
  return useMutation({
    mutationFn: (input: HeartbeatInput) => officeApi.heartbeat(input),
  })
}

export function useSetStatus(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: PresenceStatus | null) =>
      officeApi.setStatus(workspaceId!, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["office-room", workspaceId] }),
  })
}

export function useMyAvatar(enabled = true) {
  return useQuery({
    queryKey: ["office-my-avatar"],
    queryFn: officeApi.getMyAvatar,
    enabled,
  })
}

// Personagem de vários usuários numa request só — usado no board pra trocar
// a inicial genérica pelo avatar de quem tem um configurado. `userIds` sem
// ordenação estável faria a queryKey mudar (e refetchar) a cada render só
// pela ordem diferente do array vindo de um novo `.map()`.
export function useAvatarsBatch(workspaceId: string | null, userIds: string[]) {
  const key = Array.from(new Set(userIds)).sort().join(",")
  return useQuery({
    queryKey: ["office-avatars-batch", workspaceId, key],
    queryFn: () => officeApi.getAvatarsBatch(workspaceId!, key.split(",")),
    enabled: !!workspaceId && key.length > 0,
    staleTime: 5 * 60_000,
  })
}
