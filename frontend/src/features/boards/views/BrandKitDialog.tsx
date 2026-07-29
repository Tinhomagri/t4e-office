// Kit de marca do workspace: tom de voz, cores, fontes e diretrizes. O tom de
// voz e as diretrizes alimentam automaticamente a IA de copy/campanha/repurpose.
import { Plus, X } from "lucide-react"
import { useEffect, useState } from "react"
import { getBrandKit, saveBrandKit, type BrandKit } from "@/features/copilot/copilot.api"
import { Button, Field, Input, Modal, Textarea } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

export function BrandKitDialog({
  open,
  onClose,
  workspaceId,
}: {
  open: boolean
  onClose: () => void
  workspaceId: string
}) {
  const [kit, setKit] = useState<BrandKit | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newColor, setNewColor] = useState("#0055CC")

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getBrandKit(workspaceId)
      .then(setKit)
      .catch(() => toast.error("Falha ao carregar o kit de marca."))
      .finally(() => setLoading(false))
  }, [open, workspaceId])

  const patch = (p: Partial<BrandKit>) => setKit((cur) => (cur ? { ...cur, ...p } : cur))

  const addColor = () => {
    if (!kit || !newColor) return
    if (kit.colors.includes(newColor)) return
    patch({ colors: [...kit.colors, newColor] })
  }
  const removeColor = (c: string) =>
    kit && patch({ colors: kit.colors.filter((x) => x !== c) })

  const save = async () => {
    if (!kit) return
    setSaving(true)
    try {
      const saved = await saveBrandKit(workspaceId, {
        tone_of_voice: kit.tone_of_voice,
        colors: kit.colors,
        fonts: kit.fonts,
        logo_url: kit.logo_url,
        guidelines: kit.guidelines,
      })
      setKit(saved)
      toast.success("Kit de marca salvo — a IA já usa esse tom")
      onClose()
    } catch {
      toast.error("Falha ao salvar. Só administradores podem editar.")
    } finally {
      setSaving(false)
    }
  }

  const readOnly = !kit?.can_edit

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Kit de marca"
      description="Tom de voz e diretrizes que a IA segue em toda copy gerada."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          {!readOnly && (
            <Button onClick={save} loading={saving} disabled={!kit}>
              Salvar
            </Button>
          )}
        </>
      }
    >
      {loading || !kit ? (
        <p className="text-sm text-paper-400">Carregando…</p>
      ) : (
        <div className="space-y-4">
          {readOnly && (
            <p className="rounded-lg bg-paper-100 dark:bg-ink-800 px-3 py-2 text-xs text-paper-500">
              Somente leitura — apenas administradores do workspace podem editar.
            </p>
          )}

          <Field label="Tom de voz" hint="Ex.: próximo, jovem, sem jargão corporativo. A IA segue isso.">
            <Textarea
              rows={2}
              value={kit.tone_of_voice}
              onChange={(e) => patch({ tone_of_voice: e.target.value })}
              disabled={readOnly}
              placeholder="Como a marca fala"
            />
          </Field>

          <Field label="Cores da marca">
            <div className="flex flex-wrap items-center gap-2">
              {kit.colors.map((c) => (
                <span
                  key={c}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-paper-200 dark:border-ink-700 py-1 pl-1.5 pr-2 text-xs"
                >
                  <span className="size-4 rounded-full border border-black/10" style={{ background: c }} />
                  {c}
                  {!readOnly && (
                    <button onClick={() => removeColor(c)} aria-label={`Remover ${c}`}>
                      <X className="size-3 text-paper-400 hover:text-danger" />
                    </button>
                  )}
                </span>
              ))}
              {!readOnly && (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="size-7 cursor-pointer rounded border border-paper-200 dark:border-ink-700 bg-transparent"
                    aria-label="Nova cor"
                  />
                  <button
                    onClick={addColor}
                    className="grid size-7 place-items-center rounded-lg border border-paper-200 dark:border-ink-700 text-paper-400 hover:text-ink dark:hover:text-paper"
                    aria-label="Adicionar cor"
                  >
                    <Plus className="size-4" />
                  </button>
                </span>
              )}
            </div>
          </Field>

          <Field label="Fontes">
            <Input
              value={kit.fonts}
              onChange={(e) => patch({ fonts: e.target.value })}
              disabled={readOnly}
              placeholder="Ex.: Inter (títulos), Georgia (corpo)"
            />
          </Field>

          <Field label="URL do logo">
            <Input
              value={kit.logo_url}
              onChange={(e) => patch({ logo_url: e.target.value })}
              disabled={readOnly}
              placeholder="https://…"
            />
          </Field>

          <Field label="Diretrizes" hint="O que evitar, termos obrigatórios, etc. A IA respeita.">
            <Textarea
              rows={3}
              value={kit.guidelines}
              onChange={(e) => patch({ guidelines: e.target.value })}
              disabled={readOnly}
              placeholder="Ex.: nunca usar gírias; sempre citar o nome completo do produto."
            />
          </Field>
        </div>
      )}
    </Modal>
  )
}
