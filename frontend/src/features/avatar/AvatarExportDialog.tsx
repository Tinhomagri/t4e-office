import { useRef, useState } from "react"
import { Download, FileJson, Upload } from "lucide-react"

import { Button, Modal, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

import { downloadCanvasPng, downloadText, renderAvatarPng } from "./avatar.export"
import { parsePreset, serializePreset } from "./avatar.preset"
import type { AvatarConfig } from "./avatar.types"

const SCALES = [1, 2, 4, 8] as const

export function AvatarExportDialog({
  open,
  onClose,
  config,
  onImport,
}: {
  open: boolean
  onClose: () => void
  config: AvatarConfig
  onImport: (config: AvatarConfig) => void
}) {
  const [scale, setScale] = useState<(typeof SCALES)[number]>(8)
  const [transparent, setTransparent] = useState(true)
  const [bgColor, setBgColor] = useState("#e9e6dd")
  const [frames, setFrames] = useState<1 | 2>(1)
  const fileRef = useRef<HTMLInputElement>(null)

  const slug = (config.name || "avatar").toLowerCase().replace(/\s+/g, "-")

  const exportPng = () => {
    const canvas = renderAvatarPng(config, {
      scale,
      background: transparent ? null : bgColor,
      frames,
    })
    downloadCanvasPng(canvas, `${slug}-${scale}x.png`)
    toast.success("PNG exportado")
  }

  const exportJson = () => {
    downloadText(serializePreset(config), `${slug}.avatar.json`)
    toast.success("Preset JSON exportado")
  }

  const importJson = async (file: File) => {
    const result = parsePreset(await file.text())
    if (!result.ok || !result.config) {
      toast.error(`Preset inválido: ${result.errors.join("; ")}`)
      return
    }
    onImport(result.config)
    toast.success("Preset importado")
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Exportar avatar" description="PNG para uso externo ou preset JSON reimportável">
      <div className="space-y-5">
        <Field label="Escala">
          <div className="flex gap-1.5">
            {SCALES.map((s) => (
              <SegBtn key={s} active={scale === s} onClick={() => setScale(s)}>
                {s}x
              </SegBtn>
            ))}
          </div>
        </Field>

        <Field label="Fundo">
          <div className="flex items-center gap-2">
            <SegBtn active={transparent} onClick={() => setTransparent(true)}>
              Transparente
            </SegBtn>
            <SegBtn active={!transparent} onClick={() => setTransparent(false)}>
              Cor sólida
            </SegBtn>
            {!transparent && (
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="size-9 cursor-pointer rounded-lg border border-ink/15 bg-transparent"
              />
            )}
          </div>
        </Field>

        <Field label="Conteúdo">
          <div className="flex gap-1.5">
            <SegBtn active={frames === 1} onClick={() => setFrames(1)}>
              Frame único
            </SegBtn>
            <SegBtn active={frames === 2} onClick={() => setFrames(2)}>
              Spritesheet (2 frames)
            </SegBtn>
          </div>
        </Field>

        <div className="flex flex-wrap gap-2 border-t border-ink/10 dark:border-ink-700 pt-4">
          <Button onClick={exportPng} icon={<Download className="size-4" />}>
            Baixar PNG
          </Button>
          <Button variant="outline" onClick={exportJson} icon={<FileJson className="size-4" />}>
            Baixar preset JSON
          </Button>
          <Button
            variant="ghost"
            onClick={() => fileRef.current?.click()}
            icon={<Upload className="size-4" />}
          >
            Importar preset
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importJson(f)
              e.target.value = ""
            }}
          />
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-paper-500">{label}</p>
      {children}
    </div>
  )
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-ink bg-ink text-paper"
          : "border-ink/15 text-paper-600 hover:text-ink dark:hover:text-paper",
      )}
    >
      {children}
    </button>
  )
}
