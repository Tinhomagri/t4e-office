import { Eye, EyeOff, type LucideIcon } from "lucide-react"
import { useState } from "react"

interface FieldProps {
  id: string
  label: string
  type?: "text" | "email" | "password"
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  icon: LucideIcon
  /** Campo de senha ganha botão de mostrar/ocultar automaticamente */
  revealable?: boolean
}

// Campo profissional: label fixo, moldura, ícone à esquerda e (opcional)
// botão de revelar senha à direita.
export function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  icon: Icon,
  revealable = false,
}: FieldProps) {
  const [revealed, setRevealed] = useState(false)
  const effectiveType = revealable ? (revealed ? "text" : "password") : type

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-ink dark:text-paper">
        {label}
      </label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-paper-400"
          strokeWidth={1.75}
        />
        <input
          id={id}
          type={effectiveType}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className="input-box"
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-paper-400 transition-colors hover:text-ink dark:hover:text-paper"
          >
            {revealed ? (
              <EyeOff className="size-[18px]" strokeWidth={1.75} />
            ) : (
              <Eye className="size-[18px]" strokeWidth={1.75} />
            )}
          </button>
        )}
      </div>
    </div>
  )
}
