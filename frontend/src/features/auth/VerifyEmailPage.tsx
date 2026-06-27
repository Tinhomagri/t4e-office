import { useMutation } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react"
import { useEffect, useRef } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { extractApiError } from "@/shared/api/client"

import { verifyEmail } from "./auth.api"
import { AuthLayout } from "./AuthLayout"

// Tela aberta pelo link "confirmar email". Lê ?token= da URL e confirma
// automaticamente ao montar. Mostra carregando -> sucesso ou erro.
export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get("token") ?? ""
  const firedRef = useRef(false)

  const mutation = useMutation({
    mutationFn: () => verifyEmail({ token }),
  })

  // Dispara uma única vez (StrictMode monta duas vezes em dev)
  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true
    if (token) mutation.mutate()
  }, [token, mutation])

  // Sem token na URL: link malformado
  if (!token) {
    return (
      <AuthLayout
        title="Link inválido"
        subtitle="Não encontramos o token de verificação."
      >
        <ResultCard
          tone="error"
          message="O link parece incompleto. Abra o link diretamente do email que enviamos."
        />
        <BackToLogin />
      </AuthLayout>
    )
  }

  if (mutation.isPending || mutation.isIdle) {
    return (
      <AuthLayout title="Confirmando seu email" subtitle="Só um instante…">
        <div className="flex items-center gap-3 rounded-xl border border-ink/10 bg-paper-100 p-4">
          <Loader2 className="size-5 animate-spin text-ink" strokeWidth={1.75} />
          <p className="text-sm text-paper-500">Validando seu link de confirmação.</p>
        </div>
      </AuthLayout>
    )
  }

  if (mutation.isSuccess) {
    return (
      <AuthLayout
        title="Email confirmado!"
        subtitle="Sua conta está ativa e pronta para uso."
      >
        <ResultCard
          tone="success"
          message={mutation.data?.message ?? "Email verificado com sucesso."}
        />
        <Link to="/login" className="btn-solid mt-2 flex w-full items-center justify-center gap-2">
          <span className="relative">Ir para o login</span>
          <ArrowRight className="relative size-[18px]" />
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Não foi possível confirmar"
      subtitle="O link pode ter expirado ou já ter sido usado."
    >
      <ResultCard tone="error" message={extractApiError(mutation.error)} />
      <BackToLogin />
    </AuthLayout>
  )
}

function ResultCard({ tone, message }: { tone: "success" | "error"; message: string }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-5 flex items-start gap-3 rounded-xl border border-ink/10 bg-paper-100 p-4"
    >
      <Icon className="mt-0.5 size-5 shrink-0 text-ink" strokeWidth={1.75} />
      <p className="text-sm leading-relaxed text-paper-500">{message}</p>
    </motion.div>
  )
}

function BackToLogin() {
  return (
    <Link
      to="/login"
      className="flex items-center justify-center gap-2 text-sm font-medium text-ink underline-offset-4 hover:underline"
    >
      Voltar para o login
    </Link>
  )
}
