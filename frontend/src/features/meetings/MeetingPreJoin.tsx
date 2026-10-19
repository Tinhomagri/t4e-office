import { Loader2, Mic, MicOff, Video, VideoOff, Volume2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button, cx } from "@/shared/ui/primitives"
import { mediaErrorMessage } from "./MediaSync"
import { getPreferredDevice, setPreferredDevice, type PreferredDeviceKind } from "./mediaDevices"

export type PreJoinChoice = { audio: boolean; video: boolean }

type DeviceList = Record<PreferredDeviceKind, MediaDeviceInfo[]>

const EMPTY_DEVICES: DeviceList = { audioinput: [], videoinput: [], audiooutput: [] }

/**
 * Tela de preparação antes de entrar na sala — a mesma ideia do Meet.
 *
 * Duas coisas que só dá para resolver aqui, antes de qualquer um te ver: se a
 * câmera e o microfone certos estão selecionados, e se o microfone realmente
 * está captando (a barrinha de nível). Entrar direto na chamada transformava
 * essa verificação num problema público — a pessoa descobria o mic errado
 * depois de falar dois minutos no vazio.
 */
export function MeetingPreJoin({
  roomName,
  onJoin,
  onCancel,
}: {
  roomName: string
  onJoin: (choice: PreJoinChoice) => void
  onCancel: () => void
}) {
  const [audio, setAudio] = useState(true)
  const [video, setVideo] = useState(true)
  const [devices, setDevices] = useState<DeviceList>(EMPTY_DEVICES)
  const [selected, setSelected] = useState<Record<PreferredDeviceKind, string>>(() => ({
    audioinput: getPreferredDevice("audioinput") ?? "",
    videoinput: getPreferredDevice("videoinput") ?? "",
    audiooutput: getPreferredDevice("audiooutput") ?? "",
  }))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const levelRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // A mesma faixa em estado, não só em ref: o medidor de nível precisa ser
  // re-montado quando a captura é refeita, e um ref não dispara efeito.
  const [stream, setStream] = useState<MediaStream | null>(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStream(null)
  }, [])

  const refreshDevices = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices()
    const next: DeviceList = { audioinput: [], videoinput: [], audiooutput: [] }
    for (const d of all) {
      if (d.kind in next) next[d.kind as PreferredDeviceKind].push(d)
    }
    setDevices(next)
    // O id guardado pode ser de um aparelho que não está mais plugado. Nesse
    // caso o select cairia num valor inexistente e mostraria vazio, então
    // voltamos para o padrão do sistema.
    setSelected((old) => {
      const fixed = { ...old }
      for (const kind of Object.keys(next) as PreferredDeviceKind[]) {
        if (fixed[kind] && !next[kind].some((d) => d.deviceId === fixed[kind])) fixed[kind] = ""
      }
      return fixed
    })
  }, [])

  // Reabre a captura a cada troca de dispositivo ou de botão ligado/desligado.
  // É o preview: nenhuma destas faixas é publicada, elas morrem ao entrar.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      stopStream()
      if (!audio && !video) {
        setLoading(false)
        return
      }
      try {
        const captured = await navigator.mediaDevices.getUserMedia({
          audio: audio && { ...(selected.audioinput ? { deviceId: { exact: selected.audioinput } } : {}) },
          video: video && { ...(selected.videoinput ? { deviceId: { exact: selected.videoinput } } : {}) },
        })
        if (cancelled) {
          captured.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = captured
        setStream(captured)
        setError(null)
        if (videoRef.current) videoRef.current.srcObject = captured
        // Os rótulos dos dispositivos só vêm preenchidos depois da permissão
        // concedida — por isso a enumeração acontece aqui, e não na montagem.
        await refreshDevices()
      } catch (err) {
        if (!cancelled) setError(mediaErrorMessage(video ? "video" : "audio", err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [audio, video, selected.audioinput, selected.videoinput, refreshDevices, stopStream])

  useEffect(() => stopStream, [stopStream])

  // Barrinha de nível do microfone. Escreve direto no estilo do nó em vez de
  // passar por estado: são 60 atualizações por segundo, e re-renderizar a tela
  // inteira nesse ritmo trava o preview da câmera.
  useEffect(() => {
    const track = stream?.getAudioTracks()[0]
    if (!audio || !track) {
      if (levelRef.current) levelRef.current.style.transform = "scaleX(0)"
      return
    }
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    context.createMediaStreamSource(new MediaStream([track])).connect(analyser)
    const samples = new Uint8Array(analyser.frequencyBinCount)
    let frame = 0
    const tick = () => {
      analyser.getByteTimeDomainData(samples)
      let peak = 0
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128))
      // 128 é o fundo de escala do byte; o ×3 só deixa a fala normal ocupar a
      // barra inteira em vez de um tracinho tímido no canto.
      const level = Math.min(1, (peak / 128) * 3)
      if (levelRef.current) levelRef.current.style.transform = `scaleX(${level.toFixed(3)})`
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      void context.close()
    }
  }, [audio, stream])

  const choose = (kind: PreferredDeviceKind, deviceId: string) => {
    setSelected((old) => ({ ...old, [kind]: deviceId }))
    setPreferredDevice(kind, deviceId || undefined)
  }

  const enter = () => {
    // Solta a captura do preview antes de a sala pedir a dela: webcams que só
    // aceitam um cliente por vez (muitas USB) rejeitariam a segunda abertura.
    stopStream()
    onJoin({ audio, video })
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-ink-950 p-4">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-[1.4fr_1fr] md:items-center">
        <div>
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-ink-700">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cx("size-full object-cover", !video && "hidden")}
              // Espelhado como todo preview de câmera: a pessoa se enxerga
              // como num espelho, não invertida.
              style={{ transform: "scaleX(-1)" }}
            />
            {!video && (
              <div className="grid size-full place-items-center text-sm text-paper-500">
                {loading ? <Loader2 className="size-6 animate-spin" /> : "Câmera desligada"}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-ink-950/80 to-transparent p-4">
              <PreJoinToggle on={audio} onClick={() => setAudio((v) => !v)} label="microfone">
                {audio ? <Mic className="size-5" /> : <MicOff className="size-5" />}
              </PreJoinToggle>
              <PreJoinToggle on={video} onClick={() => setVideo((v) => !v)} label="câmera">
                {video ? <Video className="size-5" /> : <VideoOff className="size-5" />}
              </PreJoinToggle>
            </div>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-800">
            <div
              ref={levelRef}
              className="h-full origin-left bg-brand-500 transition-transform duration-75"
              style={{ transform: "scaleX(0)" }}
            />
          </div>

          {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-paper-500">Entrar em</p>
            <h2 className="truncate text-xl font-semibold text-paper-100">{roomName}</h2>
          </div>

          <DeviceSelect
            icon={<Mic className="size-4" />}
            label="Microfone"
            options={devices.audioinput}
            value={selected.audioinput}
            onChange={(id) => choose("audioinput", id)}
          />
          <DeviceSelect
            icon={<Video className="size-4" />}
            label="Câmera"
            options={devices.videoinput}
            value={selected.videoinput}
            onChange={(id) => choose("videoinput", id)}
          />
          {devices.audiooutput.length > 0 && (
            <DeviceSelect
              icon={<Volume2 className="size-4" />}
              label="Saída de áudio"
              options={devices.audiooutput}
              value={selected.audiooutput}
              onChange={(id) => choose("audiooutput", id)}
            />
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={enter} className="flex-1">Entrar agora</Button>
            <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          </div>
          <p className="text-[11px] text-paper-500">
            Os dispositivos escolhidos aqui ficam salvos para as próximas reuniões.
          </p>
        </div>
      </div>
    </div>
  )
}

function PreJoinToggle({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={on ? `Desligar ${label}` : `Ligar ${label}`}
      aria-label={on ? `Desligar ${label}` : `Ligar ${label}`}
      aria-pressed={on}
      className={cx(
        "grid size-11 place-items-center rounded-full text-white transition-colors",
        on ? "bg-white/15 hover:bg-white/25" : "bg-red-600 hover:bg-red-500",
      )}
    >
      {children}
    </button>
  )
}

function DeviceSelect({
  icon,
  label,
  options,
  value,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  options: MediaDeviceInfo[]
  value: string
  onChange: (deviceId: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs text-paper-400">{icon} {label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-paper-200 outline-none focus:ring-1 focus:ring-brand-500"
      >
        <option value="">Padrão do sistema</option>
        {options.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label || `${label} ${i + 1}`}</option>
        ))}
      </select>
    </label>
  )
}
