import { useConnectionState, useLocalParticipant, useRoomContext } from "@livekit/components-react"
import { ConnectionState } from "livekit-client"
import { useEffect, useRef } from "react"

export type MediaKind = "audio" | "video"

/**
 * Espelha os botões de microfone/câmera nas faixas publicadas.
 *
 * Duas coisas que este componente resolve, e que faziam a câmera "às vezes não
 * ligar":
 *
 * 1. Ligar antes de conectar. O clique entra na sala e acende o botão no mesmo
 *    gesto, mas o handshake com o SFU leva alguns quadros. Publicar antes disso
 *    rejeita, e como o botão já estava aceso nada disparava uma nova tentativa.
 *    Por isso o efeito depende do estado da conexão: ele reaplica ao conectar.
 * 2. Falha de dispositivo. Permissão negada ou webcam ocupada por outro app
 *    (Meet, Zoom, OBS) rejeita a promessa. Antes ela era descartada com `void`
 *    e o botão ficava aceso sem imagem nenhuma; agora o erro sobe pelo
 *    `onError` para quem chamou desfazer o botão e avisar.
 */
export function MediaSync({
  audio,
  video,
  onError,
}: {
  audio: boolean
  video: boolean
  onError?: (kind: MediaKind, error: unknown) => void
}) {
  const room = useRoomContext()
  const state = useConnectionState(room)
  const { localParticipant } = useLocalParticipant()
  // Fora das dependências de propósito: um callback declarado inline no JSX
  // muda de identidade a cada render do pai, e o efeito republicaria as faixas
  // sem parar.
  const errorRef = useRef(onError)
  errorRef.current = onError

  useEffect(() => {
    if (state !== ConnectionState.Connected) return
    let cancelled = false
    void (async () => {
      try {
        await localParticipant.setMicrophoneEnabled(audio)
      } catch (error) {
        if (!cancelled) errorRef.current?.("audio", error)
      }
      try {
        await localParticipant.setCameraEnabled(video)
      } catch (error) {
        if (!cancelled) errorRef.current?.("video", error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [audio, video, localParticipant, state])

  return null
}

/** Mensagem curta para o usuário a partir do erro do getUserMedia. */
export function mediaErrorMessage(kind: MediaKind, error: unknown): string {
  const device = kind === "video" ? "câmera" : "microfone"
  const name = error instanceof Error ? error.name : ""
  if (name === "NotAllowedError") return `Permissão para usar a ${device} foi negada no navegador.`
  if (name === "NotFoundError") return `Nenhuma ${device} encontrada neste computador.`
  if (name === "NotReadableError") return `A ${device} está em uso por outro aplicativo.`
  return `Não foi possível ligar a ${device}.`
}
