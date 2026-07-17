import { Modal } from "@/shared/ui/primitives"

import { AvatarCanvas } from "./AvatarCanvas"
import { GALLERY_PRESETS } from "./avatar.preset"
import type { AvatarConfig } from "./avatar.types"

export function AvatarPresetGallery({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (config: AvatarConfig) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="Galeria de presets" description="Comece de um modelo e ajuste ao seu gosto" size="lg">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {GALLERY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => {
              onPick(preset.config)
              onClose()
            }}
            className="group flex flex-col items-center gap-2 rounded-xl border border-ink/10 dark:border-ink-700 p-3 transition-all hover:border-ink/40 hover:shadow-sm"
          >
            <div className="grid place-items-center rounded-lg bg-paper-100 dark:bg-ink-800 p-2 transition-transform group-hover:scale-105">
              <AvatarCanvas config={preset.config} anim="idle" scale={4} />
            </div>
            <span className="text-xs font-medium text-ink dark:text-paper">{preset.label}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
