import { motion } from "framer-motion"
import { ArrowLeft, MailCheck, Mail } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { Field } from "@/shared/ui/Field"
import { SubmitButton } from "@/shared/ui/SubmitButton"

import { AuthLayout } from "./AuthLayout"

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = () => {
    if (!email.trim()) return
    setLoading(true)
    // TODO: integrar com endpoint de reset de senha do backend (ainda não existe).
    // Mensagem neutra para não revelar se o email está cadastrado.
    setTimeout(() => {
      setLoading(false)
      setSent(true)
    }, 700)
  }

  if (sent) {
    return (
      <AuthLayout title="Verifique seu email" subtitle="Enviamos as instruções de recuperação.">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-start gap-3 rounded-xl border border-ink/10 bg-paper-100 p-4">
            <MailCheck className="mt-0.5 size-5 shrink-0 text-ink" strokeWidth={1.75} />
            <p className="text-sm leading-relaxed text-paper-500">
              Se houver uma conta associada a{" "}
              <span className="font-medium text-ink">{email}</span>, você receberá
              um link para redefinir sua senha em instantes.
            </p>
          </div>
          <Link
            to="/login"
            className="flex items-center justify-center gap-2 text-sm font-medium text-ink underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" /> Voltar para o login
          </Link>
        </motion.div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Informe seu email e enviaremos um link de redefinição."
    >
      <div className="space-y-5">
        <Field
          id="email"
          label="Email"
          type="email"
          icon={Mail}
          value={email}
          onChange={setEmail}
          placeholder="voce@empresa.com.br"
          autoComplete="email"
        />

        <SubmitButton
          label="Enviar link"
          loading={loading}
          onClick={handleSubmit}
        />

        <Link
          to="/login"
          className="flex items-center justify-center gap-2 text-sm font-medium text-ink underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" /> Voltar para o login
        </Link>
      </div>
    </AuthLayout>
  )
}
