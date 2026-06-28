import { Check } from "lucide-react"
import { useState } from "react"

import { PageHeader } from "@/shared/ui/primitives"
import { AvatarCanvas } from "./AvatarCanvas"
import { useAvatarStore } from "./avatar.store"
import {
  ACCESSORIES, ANIM_LABELS, BOTTOMS, DIRS, HAIR_STYLES, HANDHELDS, PAL, SHOES, TOPS,
  type AvatarConfig, type Direction,
} from "./avatar.types"

const ANIM_PREVIEW = ["idle", "walk", "run", "wave", "dance", "jamal", "type", "celebrate"]

export function AvatarLabPage() {
  const config = useAvatarStore((s) => s.config)
  const created = useAvatarStore((s) => s.created)
  const setField = useAvatarStore((s) => s.set)
  const save = useAvatarStore((s) => s.save)
  const [anim, setAnim] = useState("idle")
  const [dir, setDir] = useState<Direction>("down")
  const [savedFlash, setSavedFlash] = useState(false)

  const handleSave = () => {
    save()
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1800)
  }

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        {/* Palco */}
        <div className="space-y-4">
          <div className="grid place-items-center rounded-2xl border border-ink/10 bg-ink py-8">
            <AvatarCanvas config={config} anim={anim} dir={dir} scale={8} className="block" />
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
            className={`size-7 rounded-md transition-transform ${value === i ? "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-paper" : "ring-1 ring-ink/10"}`}
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
