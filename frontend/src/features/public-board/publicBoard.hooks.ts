import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

import * as api from "./publicBoard.api"
import type { PublicBoardMessage } from "./publicBoard.api"

export function usePublicBoard(token: string | undefined, code?: string) {
  return useQuery({
    queryKey: ["public-board", token, code],
    queryFn: () => api.getPublicBoard(token!, code),
    enabled: !!token,
    // Outras pessoas podem estar olhando o mesmo link ao mesmo tempo que o
    // dev trabalha — reconsulta sozinho pra não parecer parado. Mais rápido
    // que o board interno porque aqui não tem SSE/notificação nenhuma
    // avisando de mudança — é o único jeito de perceber algo novo.
    refetchInterval: 5_000,
    retry: false,
  })
}

export function useCreatePublicCard(token: string | undefined, code?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      title: string
      description?: string
      status?: string
      image?: File
      flagged?: boolean
    }) => api.createPublicCard(token!, { ...input, code }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["public-board", token] }),
  })
}

export function useCreatePublicComment(token: string | undefined, code?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { cardId: string; author_name: string; body: string }) =>
      api.createPublicComment(token!, input.cardId, { author_name: input.author_name, body: input.body, code }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["public-board", token] }),
  })
}

export function usePublicMessages(token: string | undefined, enabled: boolean, code?: string) {
  return useQuery({
    queryKey: ["public-board-messages", token, code],
    queryFn: () => api.getPublicMessages(token!, code),
    enabled: enabled && !!token,
    // O SSE (usePublicMessageStream) é quem entrega em tempo real agora —
    // isto aqui é só rede de segurança pra quem perdeu a conexão do stream.
    refetchInterval: 20_000,
  })
}

// Espera cancelável usada pelo backoff do stream.
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const t = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => { clearTimeout(t); resolve() }, { once: true })
  })
}

/**
 * Tempo real do mural público via SSE — mesma técnica do sino interno
 * (`useNotificationStream`), sem header de autenticação (rota é anônima; o
 * código de acesso, se houver, vai na query string). Sem isto o cliente só
 * via mensagem nova no próximo poll (até 20s de espera).
 */
export function usePublicMessageStream(
  token: string | undefined,
  code: string | undefined,
  onNew: (m: PublicBoardMessage) => void,
) {
  const onNewRef = useRef(onNew)
  onNewRef.current = onNew

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    let stopped = false
    let retry = 3_000

    const run = async () => {
      while (!stopped) {
        try {
          const params = new URLSearchParams()
          if (code) params.set("code", code)
          const qs = params.toString()
          const res = await fetch(`/api/public/boards/${token}/messages/stream/${qs ? `?${qs}` : ""}`, {
            headers: { Accept: "text/event-stream" },
            signal: controller.signal,
          })
          // Código de acesso errado/ausente: não adianta insistir com o mesmo
          // valor — para até `code` mudar (novo render reinicia o efeito).
          if (res.status === 401) return
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`)

          retry = 3_000
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""

          while (!stopped) {
            const { value, done } = await reader.read()
            if (done) break // backend fecha ~55s → reconecta
            buffer += decoder.decode(value, { stream: true })
            const events = buffer.split("\n\n")
            buffer = events.pop() ?? ""
            for (const evt of events) {
              const line = evt.split("\n").find((l) => l.startsWith("data:"))
              if (!line) continue // heartbeat
              try {
                onNewRef.current(JSON.parse(line.slice(5).trim()) as PublicBoardMessage)
              } catch {
                // ignora linhas que não são JSON
              }
            }
          }
        } catch {
          if (stopped) return
        }
        await sleep(retry, controller.signal)
        retry = Math.min(retry * 2, 30_000)
      }
    }

    run()
    return () => {
      stopped = true
      controller.abort()
    }
  }, [token, code])
}

export function useCreatePublicMessage(token: string | undefined, code?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { author_name: string; body: string; reply_to_id?: string }) =>
      api.createPublicMessage(token!, { ...input, code }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["public-board-messages", token] }),
  })
}
