import { Download, Paintbrush, RotateCcw, Save, Search, Type, Upload } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  COLOR_GROUPS,
  FONT_TOKENS,
  RADIUS_TOKENS,
  type ColorToken,
} from "@/shared/whitelabel.tokens"
import {
  EMPTY_WHITELABEL,
  isWhitelabelEmpty,
  sanitizeWhitelabel,
  useWhitelabelStore,
  type Whitelabel,
} from "@/shared/whitelabel"
import { Button, Field, Input, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

/**
 * Whitelabel: cada cor, fonte e raio do produto editável pela própria pessoa.
 *
 * O rascunho é aplicado no documento enquanto a tela está aberta — mexer num
 * seletor repinta a interface inteira na hora, inclusive esta tela. É o único
 * jeito honesto de escolher uma paleta: ver o resultado no produto de verdade,
 * não num quadradinho de amostra. Sair sem salvar devolve a marca anterior
 * (ver o `setPreview(null)` na desmontagem).
 */
export function WhitelabelSection({ onPersist }: { onPersist: (wl: Whitelabel) => Promise<void> }) {
  const saved = useWhitelabelStore((s) => s.whitelabel)
  const setPreview = useWhitelabelStore((s) => s.setPreview)
  const setWhitelabel = useWhitelabelStore((s) => s.setWhitelabel)
  const [draft, setDraft] = useState<Whitelabel>(saved)
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)

  // Enquanto esta tela existir, o rascunho é o que pinta o app.
  useEffect(() => { setPreview(draft) }, [draft, setPreview])
  useEffect(() => () => setPreview(null), [setPreview])

  const patch = (change: Partial<Whitelabel>) => setDraft((v) => ({ ...v, ...change }))
  const setColor = (key: string, value: string | null) =>
    setDraft((v) => {
      const colors = { ...v.colors }
      if (value) colors[key] = value
      else delete colors[key]
      return { ...v, colors }
    })

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return COLOR_GROUPS
    return COLOR_GROUPS
      .map((g) => ({
        ...g,
        tokens: g.tokens.filter(
          (t) => t.label.toLowerCase().includes(term) || t.key.toLowerCase().includes(term),
        ),
      }))
      .filter((g) => g.tokens.length > 0)
  }, [query])

  const changed = Object.keys(draft.colors).length
    + Object.keys(draft.fonts).length
    + Object.keys(draft.radius).length

  const onSave = async () => {
    setSaving(true)
    try {
      // O store grava no storage e é quem o App lê na próxima subida; o perfil
      // é atualizado pelo componente pai, que tem o `save()` da API.
      setWhitelabel(draft)
      setPreview(null)
      await onPersist(draft)
      toast.success("Marca aplicada.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a marca.")
    } finally {
      setSaving(false)
    }
  }

  const onExport = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${draft.appName || "marca"}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <Panel
        icon={Paintbrush}
        title="Identidade"
        description="O nome e o símbolo que aparecem no topo e na aba do navegador."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do produto" hint="Vazio mantém “Office”.">
            <Input
              value={draft.appName}
              maxLength={40}
              onChange={(e) => patch({ appName: e.target.value })}
              placeholder="Office"
            />
          </Field>
          <Field label="Sigla do símbolo" hint="Até 4 letras, usadas quando não há logotipo.">
            <Input
              value={draft.appInitials}
              maxLength={4}
              onChange={(e) => patch({ appInitials: e.target.value })}
              placeholder="T4"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Logotipo" hint="PNG, JPG, WEBP ou SVG de até 200 KB.">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-500 text-[11px] font-bold text-white">
                  {draft.logoUrl
                    ? <img src={draft.logoUrl} alt="" className="size-full object-contain" />
                    : (draft.appInitials || "T4")}
                </span>
                <Button variant="outline" onClick={() => logoRef.current?.click()}>Escolher arquivo</Button>
                {draft.logoUrl && (
                  <Button variant="ghost" onClick={() => patch({ logoUrl: "" })}>Remover</Button>
                )}
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ""
                    if (!file) return
                    if (file.size > 200_000) { toast.error("O logotipo precisa ter até 200 KB."); return }
                    patch({ logoUrl: await readAsDataUri(file) })
                  }}
                />
              </div>
            </Field>
          </div>
        </div>
      </Panel>

      <Panel
        icon={Type}
        title="Tipografia e formas"
        description="Qualquer pilha de fontes válida em CSS — inclusive uma fonte da empresa já carregada na página."
      >
        <div className="grid gap-4">
          {FONT_TOKENS.map((token) => (
            <Field key={token.key} label={token.label} hint={`Padrão: ${token.value}`}>
              <Input
                value={draft.fonts[token.key] ?? ""}
                placeholder={token.value}
                onChange={(e) => {
                  const fonts = { ...draft.fonts }
                  if (e.target.value.trim()) fonts[token.key] = e.target.value
                  else delete fonts[token.key]
                  patch({ fonts })
                }}
              />
            </Field>
          ))}
          <div className="grid gap-3 sm:grid-cols-3">
            {RADIUS_TOKENS.map((token) => (
              <Field key={token.key} label={`Raio · ${token.label}`} hint={token.value}>
                <Input
                  value={draft.radius[token.key] ?? ""}
                  placeholder={token.value}
                  onChange={(e) => {
                    const radius = { ...draft.radius }
                    if (e.target.value.trim()) radius[token.key] = e.target.value
                    else delete radius[token.key]
                    patch({ radius })
                  }}
                />
              </Field>
            ))}
          </div>
        </div>
      </Panel>

      <Panel
        icon={Paintbrush}
        title="Cores"
        description="Cada token do design system. Um campo em branco volta para a cor original."
        aside={
          <label className="relative block w-48">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-paper-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar token"
              className="w-full rounded-lg border border-paper-200 bg-paper py-1.5 pl-8 pr-2 text-xs outline-none focus:border-brand-400 dark:border-ink-700 dark:bg-ink-800 dark:text-paper-200"
            />
          </label>
        }
      >
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.id}>
              <h3 className="text-[13px] font-semibold text-ink dark:text-paper">{group.label}</h3>
              <p className="mb-3 text-xs text-paper-500">{group.hint}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.tokens.map((token) => (
                  <ColorRow
                    key={token.key}
                    token={token}
                    value={draft.colors[token.key] ?? null}
                    onChange={(value) => setColor(token.key, value)}
                  />
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="text-sm text-paper-500">Nenhum token com esse nome.</p>
          )}
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-paper-200 bg-paper p-4 shadow-card dark:border-ink-700 dark:bg-ink-900">
        <p className="mr-auto text-xs text-paper-500">
          {changed === 0
            ? "Nada personalizado — o produto está com a marca de fábrica."
            : `${changed} ${changed === 1 ? "token personalizado" : "tokens personalizados"}.`}
        </p>
        <Button variant="ghost" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
          Importar
        </Button>
        <Button variant="ghost" icon={<Download className="size-4" />} onClick={onExport}>
          Exportar
        </Button>
        <Button
          variant="outline"
          icon={<RotateCcw className="size-4" />}
          onClick={() => setDraft(EMPTY_WHITELABEL)}
          disabled={isWhitelabelEmpty(draft)}
        >
          Restaurar padrão
        </Button>
        <Button loading={saving} icon={<Save className="size-4" />} onClick={() => void onSave()}>
          Aplicar marca
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (!file) return
            try {
              setDraft(sanitizeWhitelabel(JSON.parse(await file.text())))
            } catch {
              toast.error("Arquivo de marca inválido.")
            }
          }}
        />
      </div>
    </div>
  )
}

/** Uma linha de cor: amostra clicável, hex editável e botão de voltar ao padrão. */
function ColorRow({
  token,
  value,
  onChange,
}: {
  token: ColorToken
  value: string | null
  onChange: (value: string | null) => void
}) {
  const effective = value ?? token.value
  return (
    <div className="flex items-center gap-2 rounded-lg border border-paper-200 p-2 dark:border-ink-700">
      <label className="relative size-7 shrink-0 overflow-hidden rounded-md ring-1 ring-black/10">
        <span className="block size-full" style={{ backgroundColor: effective }} />
        <input
          type="color"
          value={effective}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={token.label}
        />
      </label>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink dark:text-paper">{token.label}</span>
        <code className="block truncate text-[10px] text-paper-400">{token.key}</code>
      </span>
      <input
        value={effective}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        spellCheck={false}
        className="w-[78px] shrink-0 rounded border border-paper-200 bg-transparent px-1.5 py-1 text-right font-mono text-[11px] uppercase outline-none focus:border-brand-400 dark:border-ink-700 dark:text-paper-200"
      />
      <button
        type="button"
        onClick={() => onChange(null)}
        disabled={!value}
        title="Voltar ao padrão"
        className={cx(
          "shrink-0 rounded p-1 text-paper-400 transition-opacity hover:bg-paper-100 dark:hover:bg-ink-800",
          !value && "pointer-events-none opacity-0",
        )}
      >
        <RotateCcw className="size-3.5" />
      </button>
    </div>
  )
}

function Panel({
  icon: Icon,
  title,
  description,
  aside,
  children,
}: {
  icon: typeof Paintbrush
  title: string
  description: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-paper-200 bg-paper shadow-card dark:border-ink-700 dark:bg-ink-900">
      <div className="flex items-start gap-3 border-b border-paper-100 px-5 py-4 dark:border-ink-800">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-ink dark:text-paper">{title}</h2>
          <p className="mt-0.5 text-xs text-paper-500">{description}</p>
        </div>
        {aside}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."))
    reader.readAsDataURL(file)
  })
}
