import { LiveKitRoom, ParticipantTile, useLocalParticipant, useTracks } from "@livekit/components-react"
import { Track } from "livekit-client"
import { Mic, MicOff } from "lucide-react"
import { useEffect, useRef } from "react"
import type { OfficeEngine } from "./world/engine"
import type { JoinResult } from "@/features/meetings/meetings.api"

function Tiles({ engine, localAudio }: { engine: React.MutableRefObject<OfficeEngine | null>; localAudio: boolean }) {
  const tracks = useTracks([Track.Source.Camera])
  const nodes = useRef(new Map<string, HTMLDivElement>())

  // O cartão segue o avatar no mesmo quadro em que o mundo é desenhado, e via
  // `transform` direto no nó — amostrar de 80 em 80ms com `setState` deixava o
  // vídeo sempre um pouco atrás do sprite, e a defasagem variável lia como
  // tremor. Sem re-render do React: só escrita de estilo.
  useEffect(() => {
    let raf = 0
    const follow = () => {
      for (const [identity, node] of nodes.current) {
        const pos = engine.current?.actorScreenPoint(identity)
        if (!pos) {
          node.style.visibility = "hidden"
        } else {
          node.style.visibility = "visible"
          node.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`
        }
      }
      raf = requestAnimationFrame(follow)
    }
    raf = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  return <>{tracks.map((track) => {
    // O SDK mantém a referência da câmera por um instante após desligá-la;
    // sem este filtro o ParticipantTile vira um retângulo preto no avatar.
    if (track.publication.isMuted || !track.publication.track) return null
    const identity = track.participant.identity
    const audioOn = track.participant.isLocal ? localAudio : track.participant.isMicrophoneEnabled
    return <div key={identity} ref={(node) => { if (node) nodes.current.set(identity, node); else nodes.current.delete(identity) }} className="office-video-tile absolute left-0 top-0 z-20 h-16 w-20 overflow-hidden rounded-md border-2 border-brand-400 bg-ink shadow-lg" style={{ visibility: "hidden" }}><ParticipantTile trackRef={track} className="size-full" /><span className="absolute bottom-1 right-1 grid size-4 place-items-center rounded-full bg-ink/80 text-white">{audioOn ? <Mic className="size-2.5" /> : <MicOff className="size-2.5 text-rose-300" />}</span></div>
  })}</>
}

function MediaSync({ audio, video }: { audio: boolean; video: boolean }) {
  const { localParticipant } = useLocalParticipant()
  useEffect(() => {
    void localParticipant.setMicrophoneEnabled(audio)
    void localParticipant.setCameraEnabled(video)
  }, [audio, video, localParticipant])
  return null
}

export function OfficeVideoOverlay({ session, engine, audio, video }: { session: JoinResult; engine: React.MutableRefObject<OfficeEngine | null>; audio: boolean; video: boolean }) {
  return <LiveKitRoom token={session.token} serverUrl={session.url} connect audio={false} video={false} className="absolute inset-0 pointer-events-none"><MediaSync audio={audio} video={video} /><Tiles engine={engine} localAudio={audio} /></LiveKitRoom>
}
