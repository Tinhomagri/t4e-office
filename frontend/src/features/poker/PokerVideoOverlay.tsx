import {
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react"
import { Track } from "livekit-client"
import { Mic, MicOff } from "lucide-react"

import type { JoinResult } from "@/features/meetings/meetings.api"
import { MediaSync, type MediaKind } from "@/features/meetings/MediaSync"

/** Posição do cartão, medida a partir do CENTRO do wrapper da mesa. */
export type SeatPoint = { x: number; y: number }

// Maior que o cartão do Escritório de propósito: lá o vídeo é um adereço em
// cima do boneco enquanto a pessoa anda; aqui a mesa é a tela inteira e o
// rosto de quem estima precisa ser legível. 4:3 casa com o corte padrão da
// webcam sem esticar a imagem.
export const TILE_W = 128
export const TILE_H = 96

function Tiles({
  seatOf,
  localAudio,
}: {
  seatOf: (userId: string) => SeatPoint | null
  localAudio: boolean
}) {
  const tracks = useTracks([Track.Source.Camera])
  return (
    <>
      {tracks.map((track) => {
        // O SDK mantém a referência da câmera por um instante após desligá-la;
        // sem este filtro o ParticipantTile vira um retângulo preto no assento.
        if (track.publication.isMuted || !track.publication.track) return null
        const pos = seatOf(track.participant.identity)
        if (!pos) return null
        const audioOn = track.participant.isLocal
          ? localAudio
          : track.participant.isMicrophoneEnabled
        return (
          <div
            key={track.participant.identity}
            className="poker-video-tile absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border-2 border-[#0C66E4] bg-[#0A0B0D] shadow-xl"
            style={{ marginLeft: pos.x, marginTop: pos.y, width: TILE_W, height: TILE_H }}
          >
            <ParticipantTile trackRef={track} className="size-full" />
            <span className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-full bg-[#0A0B0D]/80 text-white">
              {audioOn ? <Mic className="size-3" /> : <MicOff className="size-3 text-rose-300" />}
            </span>
          </div>
        )
      })}
    </>
  )
}

/**
 * Cartões do mesmo tamanho do vídeo real, com barras coloridas no lugar da
 * imagem — serve para conferir a proporção da mesa cheia (`?mockseats=10`)
 * sem depender de webcam nenhuma.
 */
export function MockVideoTiles({
  people,
  seatOf,
}: {
  people: { userId: string; name: string }[]
  seatOf: (userId: string) => SeatPoint | null
}) {
  return (
    <>
      {people.map((person, i) => {
        const pos = seatOf(person.userId)
        if (!pos) return null
        const hue = (i * 47) % 360
        return (
          <div
            key={person.userId}
            className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border-2 border-[#0C66E4] shadow-xl"
            style={{
              marginLeft: pos.x,
              marginTop: pos.y,
              width: TILE_W,
              height: TILE_H,
              background: `linear-gradient(150deg, hsl(${hue} 45% 32%), hsl(${(hue + 40) % 360} 40% 16%))`,
            }}
          >
            <span className="grid size-full place-items-center text-lg font-semibold text-white/80">
              {person.name}
            </span>
            <span className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-full bg-[#0A0B0D]/80 text-white">
              <Mic className="size-3" />
            </span>
          </div>
        )
      })}
    </>
  )
}

/**
 * Câmera e microfone na própria mesa do Planning Poker: o vídeo de cada pessoa
 * fica ancorado para fora do assento dela, e o áudio da sala toca sempre —
 * mesmo para quem está com a câmera desligada.
 *
 * `seatOf` recebe o `user_id` (é a identidade emitida no token) e devolve o
 * centro do cartão de vídeo, medido a partir do centro do wrapper da mesa.
 */
export function PokerVideoOverlay({
  session,
  seatOf,
  audio,
  video,
  onMediaError,
}: {
  session: JoinResult
  seatOf: (userId: string) => SeatPoint | null
  audio: boolean
  video: boolean
  onMediaError?: (kind: MediaKind, error: unknown) => void
}) {
  return (
    <LiveKitRoom
      token={session.token}
      serverUrl={session.url}
      connect
      audio={false}
      video={false}
      className="pointer-events-none absolute inset-0"
    >
      <MediaSync audio={audio} video={video} onError={onMediaError} />
      <RoomAudioRenderer />
      <Tiles seatOf={seatOf} localAudio={audio} />
    </LiveKitRoom>
  )
}
