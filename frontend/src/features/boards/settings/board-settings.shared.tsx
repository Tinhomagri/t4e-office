// Peças compartilhadas entre as abas da configuração do quadro.
import type { ReactNode } from "react"

import { cx } from "@/shared/ui/primitives"

// Cartão de seção — cada bloco de configuração vive dentro de um.
export function SettingsCard({
  title,
  description,
  children,
  actions,
}: {
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="rounded-xl border border-paper-200 bg-paper dark:border-ink-800 dark:bg-ink-900">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-200 px-3 py-2 dark:border-ink-800">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-ink dark:text-paper">{title}</h2>
          {description && <p className="text-[11px] text-paper-500">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  )
}

// Toggle acessível. Usa <button role="switch"> em vez de <input type=checkbox>
// para o estado ficar explícito para leitores de tela.
export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-ring",
        checked ? "bg-brand-500" : "bg-paper-300 dark:bg-ink-700",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  )
}

// Linha "rótulo + descrição à esquerda, controle à direita".
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-[13px] text-ink dark:text-paper">{label}</p>
        {hint && <p className="text-[11px] text-paper-500">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

// Paleta fixa para cor de coluna/avatar/card. Cores livres via input[type=color]
// dariam combinações ilegíveis no board; um conjunto curado evita isso.
export const PALETTE = [
  "#6b7280", "#ef4444", "#f97316", "#f59e0b", "#84cc16",
  "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#ec4899", "#0f172a",
]

export function ColorPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (color: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          disabled={disabled}
          aria-label={`Cor ${color}`}
          aria-pressed={value.toLowerCase() === color.toLowerCase()}
          onClick={() => onChange(color)}
          style={{ backgroundColor: color }}
          className={cx(
            "size-6 rounded-lg transition-transform focus-ring",
            value.toLowerCase() === color.toLowerCase()
              ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-paper dark:ring-offset-ink-900"
              : "hover:scale-110",
            disabled && "cursor-not-allowed opacity-50",
          )}
        />
      ))}
    </div>
  )
}
