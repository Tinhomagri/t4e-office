import {
  Check,
  Dices,
  Download,
  LayoutGrid,
  Link2,
  Redo2,
  RotateCcw,
  Undo2,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { saveAvatarConfig } from "@/features/office/office.api"
import { IconButton, PageHeader, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

import { AvatarCanvas } from "./AvatarCanvas"
import { AvatarExportDialog } from "./AvatarExportDialog"
import { AvatarPresetGallery } from "./AvatarPresetGallery"
import { decodeShare, encodeShare } from "./avatar.preset"
import { CASCADE_FIELDS, randomAvatar } from "./avatar.random"
import { useAvatarStore } from "./avatar.store"
import {
  ACCESSORIES, ANIM_LABELS, BOTTOMS, DIRS, HAIR_STYLES, HANDHELDS, PAL, SHOES, TOPS,
  type AvatarConfig, type Direction,
} from "./avatar.types"

const ANIM_PREVIEW = ["idle", "walk", "run", "wave", "dance", "jamal", "type", "celebrate"]
const ZOOMS = [1, 2, 4, 8] as const

// Fundo xadrez indicando canal alpha (padrão de editores de pixel art).
const CHECKER: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, rgba(127,127,127,.18) 25%, transparent 25%, transparent 75%, rgba(127,127,127,.18) 75%), linear-gradient(45deg, rgba(127,127,127,.18) 25%, transparent 25%, transparent 75%, rgba(127,127,127,.18) 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 8px 8px",
}

export function AvatarLabPage() {
  const config = useAvatarStore((s) => s.config)
  const created = useAvatarStore((s) => s.created)
  const setField = useAvatarStore((s) => s.set)
  const setTransient = useAvatarStore((s) => s.setTransient)
  const commit = useAvatarStore((s) => s.commit)
  const loadConfig = useAvatarStore((s) => s.loadConfig)
  const undo = useAvatarStore((s) => s.undo)
  const redo = useAvatarStore((s) => s.redo)
  const reset = useAvatarStore((s) => s.reset)
  const save = useAvatarStore((s) => s.save)
  const canUndo = useAvatarStore((s) => s.hIndex > 0)
  const canRedo = useAvatarStore((s) => s.hIndex < s.history.length - 1)

  const [anim, setAnim] = useState("idle")
  const [dir, setDir] = useState<Direction>("down")
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(8)
  const [alphaBg, setAlphaBg] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const cascading = useRef(false)

  // ?avatar=<base64> — hidrata direto de um link compartilhado.
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const shared = params.get("avatar")
    if (!shared) return
    const result = decodeShare(shared)
    if (result.ok && result.config) {
      loadConfig(result.config)
      toast.success("Avatar carregado do link compartilhado")
    } else {
      toast.error("Link de avatar inválido")
    }
    params.delete("avatar")
    setParams(params, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = () => {
    save()
    // Persiste no servidor para que o avatar apareça no Escritório para todos.
    saveAvatarConfig(config).catch(() => undefined)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1800)
  }

  // Randomização com efeito cascata: revela categoria por categoria (~80ms)
  // e registra UM único passo no histórico ao final.
  const handleRandomize = () => {
    if (cascading.current) return
    cascading.current = true
    const target = randomAvatar(undefined, config.name)
    CASCADE_FIELDS.forEach((field, i) => {
      setTimeout(() => {
        setTransient(field, target[field] as never)
        if (i === CASCADE_FIELDS.length - 1) {
          commit()
          cascading.current = false
        }
      }, i * 80)
    })
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/app/avatar?avatar=${encodeShare(config)}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link do avatar copiado")
    } catch {
      toast.error("Não foi possível copiar o link")
    }
  }

  // Atalhos: R aleatoriza, Ctrl+Z desfaz, Ctrl+Y/Ctrl+Shift+Z refaz, E exporta.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "z" && e.shiftKey) {
          e.preventDefault(); redo()
        } else if (e.key.toLowerCase() === "z") {
          e.preventDefault(); undo()
        } else if (e.key.toLowerCase() === "y") {
          e.preventDefault(); redo()
        }
        return
      }
      if (e.key.toLowerCase() === "r") handleRandomize()
      if (e.key.toLowerCase() === "e") setExportOpen(true)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  return (
    <div className="space-y-6">
      <PageHeader title="Criar Avatar" subtitle="Sua presença no Escritório Virtual">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-transform active:scale-[0.98]"
        >
          {savedFlash ? <Check className="size-4" /> : null}
          {savedFlash ? "Avatar salvo!" : created ? "Atualizar avatar" : "Salvar avatar"}
        </button>
      </PageHeader>

      {/* Barra de ações: aleatorizar / desfazer / refazer / resetar / galeria / exportar / link */}
      <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-ink/10 dark:border-ink-700 bg-paper dark:bg-ink-900 px-2 py-1.5">
        <IconButton onClick={handleRandomize} title="Aleatorizar (R)">
          <Dices className="size-4" />
        </IconButton>
        <IconButton onClick={undo} title="Desfazer (Ctrl+Z)" disabled={!canUndo} className={!canUndo ? "opacity-30 pointer-events-none" : ""}>
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton onClick={redo} title="Refazer (Ctrl+Y)" disabled={!canRedo} className={!canRedo ? "opacity-30 pointer-events-none" : ""}>
          <Redo2 className="size-4" />
        </IconButton>
        <IconButton onClick={() => { reset(); toast.info("Avatar resetado") }} title="Resetar ao padrão">
          <RotateCcw className="size-4" />
        </IconButton>
        <span className="mx-1 h-5 w-px bg-ink/10 dark:bg-ink-700" />
        <IconButton onClick={() => setGalleryOpen(true)} title="Galeria de presets">
          <LayoutGrid className="size-4" />
        </IconButton>
        <IconButton onClick={() => setExportOpen(true)} title="Exportar (E)">
          <Download className="size-4" />
        </IconButton>
        <IconButton onClick={handleShare} title="Copiar link compartilhável">
          <Link2 className="size-4" />
        </IconButton>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        {/* Palco */}
        <div className="space-y-4">
          <div
            className={cx(
              "grid place-items-center rounded-2xl border border-ink/10 py-8 transition-colors",
              alphaBg ? "" : "bg-ink",
            )}
            style={alphaBg ? CHECKER : undefined}
          >
            <AvatarCanvas config={config} anim={anim} dir={dir} scale={zoom} className="block" />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-paper-500">Zoom</p>
            <div className="flex gap-2">
              {ZOOMS.map((z) => (
                <button
                  key={z}
                  onClick={() => setZoom(z)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                    zoom === z ? "border-ink bg-ink text-paper" : "border-ink/15 text-paper-500 hover:text-ink dark:hover:text-paper"
                  }`}
                >
                  {z}x
                </button>
              ))}
              <button
                onClick={() => setAlphaBg((v) => !v)}
                title="Alternar fundo alpha (xadrez)"
                className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  alphaBg ? "border-ink bg-ink text-paper" : "border-ink/15 text-paper-500 hover:text-ink dark:hover:text-paper"
                }`}
              >
                Alpha
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-paper-500">Direção</p>
            <div className="flex gap-2">
              {DIRS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDir(d)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs capitalize transition-colors ${
                    dir === d ? "border-ink bg-ink text-paper" : "border-ink/15 text-paper-500 hover:text-ink dark:hover:text-paper"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-paper-500">Animação</p>
            <div className="flex flex-wrap gap-1.5">
              {ANIM_PREVIEW.map((a) => (
                <button
                  key={a}
                  onClick={() => setAnim(a)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                    anim === a ? "border-ink bg-ink text-paper" : "border-ink/15 text-paper-600 hover:text-ink dark:hover:text-paper"
                  }`}
                >
                  {ANIM_LABELS[a] ?? a}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Customização */}
        <div className="grid grid-cols-1 gap-5 rounded-2xl border border-ink/10 bg-paper dark:bg-ink-900 p-5 sm:grid-cols-2">
          <Field label="Gênero">
            <div className="flex gap-2">
              {(["male", "female"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setField("gender", g)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    config.gender === g ? "border-ink bg-ink text-paper" : "border-ink/15 text-paper-600 hover:text-ink dark:hover:text-paper"
                  }`}
                >
                  {g === "male" ? "Homem" : "Mulher"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Nome do avatar">
            <input
              value={config.name}
              onChange={(e) => setField("name", e.target.value)}
              className="w-full rounded-lg border border-ink/15 bg-paper-100 dark:bg-ink-800 px-3 py-2 text-sm text-ink dark:text-paper outline-none focus:border-ink/40"
            />
          </Field>

          <Swatches label="Tom de pele" colors={PAL.skin} value={config.skin} onPick={(i) => setField("skin", i)} />
          <Swatches label="Cabelo · cor" colors={PAL.hair} value={config.hair} onPick={(i) => setField("hair", i)} />
          <Opts label="Cabelo · estilo" items={HAIR_STYLES} value={config.hairStyle} onPick={(i) => setField("hairStyle", i)} />
          <Opts label="Torso · tipo" items={TOPS} value={config.top} onPick={(i) => setField("top", i)} />
          <Swatches label="Torso · cor" colors={PAL.shirt} value={config.shirt} onPick={(i) => setField("shirt", i)} />
          <Opts label="Inferior · tipo" items={BOTTOMS} value={config.bottom} onPick={(i) => setField("bottom", i)} />
          <Swatches label="Inferior · cor" colors={PAL.pants} value={config.pants} onPick={(i) => setField("pants", i)} />
          <Opts label="Calçado · tipo" items={SHOES} value={config.shoeType} onPick={(i) => setField("shoeType", i)} />
          <Swatches label="Calçado · cor" colors={PAL.shoe} value={config.shoe} onPick={(i) => setField("shoe", i)} />
          <Opts label="Acessório" items={ACCESSORIES} value={config.acc} onPick={(i) => setField("acc", i)} />
          <Opts label="Item na mão" items={HANDHELDS} value={config.hand} onPick={(i) => setField("hand", i)} />
        </div>
      </div>

      <AvatarExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        config={config}
        onImport={loadConfig}
      />
      <AvatarPresetGallery
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onPick={(c) => {
          loadConfig(c)
          toast.success("Preset aplicado")
        }}
      />
    </div>
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

function Swatches({ label, colors, value, onPick }: { label: string; colors: readonly string[]; value: number; onPick: (i: number) => void }) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((c, i) => (
          <button
            key={i}
            onClick={() => onPick(i)}
            title={c}
            style={{ background: c }}
            className={`size-7 rounded-md transition-transform hover:scale-105 ${value === i ? "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-paper" : "ring-1 ring-ink/10"}`}
          />
        ))}
      </div>
    </Field>
  )
}

function Opts({ label, items, value, onPick }: { label: string; items: string[]; value: number; onPick: (i: number) => void }) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <button
            key={it}
            onClick={() => onPick(i)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              value === i ? "border-ink bg-ink text-paper" : "border-ink/15 text-paper-600 hover:text-ink dark:hover:text-paper"
            }`}
          >
            {it}
          </button>
        ))}
      </div>
    </Field>
  )
}

export type { AvatarConfig }
