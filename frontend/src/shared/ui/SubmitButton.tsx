import { motion } from "framer-motion"
import { ArrowRight, Loader2 } from "lucide-react"

interface SubmitButtonProps {
  label: string
  loading?: boolean
  onClick: () => void
}

// Botão de envio com brilho deslizante, ícone e micro-interações.
export function SubmitButton({ label, loading, onClick }: SubmitButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={loading}
      whileHover={{ scale: loading ? 1 : 1.015 }}
      whileTap={{ scale: loading ? 1 : 0.985 }}
      className="btn-solid flex w-full items-center justify-center gap-2"
    >
      {/* Brilho que atravessa o botão */}
      <span className="pointer-events-none absolute inset-0 animate-shimmer bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.22),transparent)] bg-[length:200%_100%]" />
      {loading ? (
        <Loader2 className="relative size-[18px] animate-spin" />
      ) : (
        <>
          <span className="relative">{label}</span>
          <ArrowRight className="relative size-[18px] transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </motion.button>
  )
}
