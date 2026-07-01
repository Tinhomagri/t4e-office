import { useMutation } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, ArrowRight, Check, CheckCircle2, Lock } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { extractApiError } from "@/shared/api/client"
import { Field } from "@/shared/ui/Field"
import { SubmitButton } from "@/shared/ui/SubmitButton"

import { resetPassword } from "./auth.api"
import { AuthLayout } from "./AuthLayout"

// Regras espelham a validação do backend (>= 8 chars)
function passwordRules(password: string) {
  return [
    { label: "Ao menos 8 caracteres", ok: password.length >= 8 },
    { label: "Uma letra", ok: /[a-zA-Z]/.test(password) },
    { label: "Um número", ok: /\d/.test(password) },
  ]
}

// Tela aberta pelo link de redefinição. Lê ?token= e troca a senha.
export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)

  const rules = useMemo(() => passwordRules(password), [password])
  const passwordValid = rules.every((r) => r.ok)

  const mutation = useMutation({
    mutationFn: () => resetPassword({ token, new_password: password }),
    onError: (err) => setError(extractApiError(err)),
  })

  const handleSubmit = () => {
    setError(null)
    if (!passwordValid) {
      setError("A senha não atende aos requisitos.")
      return
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.")
      return
    }
    mutation.mutate()
  }

  if (!token) {
    return (
      <AuthLayout title="Link inválido" subtitle="Não encontramos o token de redefinição.">
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-ink/10 bg-paper-100 dark:bg-ink-800 p-4">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-ink dark:text-paper" strokeWidth={1.75} />
          <p className="text-sm leading-relaxed text-paper-500">
            Abra o link diretamente do email de redefinição.
          </p>
        </div>
        <Link to="/forgot-password" className="flex items-center justify-center gap-2 text-sm font-medium text-ink dark:text-paper underline-offset-4 hover:underline">
          Solicitar novo link
        </Link>
      </AuthLayout>
    )
  }

  if (mutation.isSuccess) {
    return (
      <AuthLayout title="Senha redefinida!" subtitle="Já pode entrar com a nova senha.">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 flex items-start gap-3 rounded-xl border border-ink/10 bg-paper-100 dark:bg-ink-800 p-4"
        >
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ink dark:text-paper" strokeWidth={1.75} />
          <p className="text-sm leading-relaxed text-paper-500">
            Sua senha foi atualizada com sucesso.
          </p>
        </motion.div>
        <Link to="/login" className="btn-solid flex w-full items-center justify-center gap-2">
          <span className="relative">Ir para o login</span>
          <ArrowRight className="relative size-[18px]" />
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Definir nova senha" subtitle="Escolha uma senha forte para sua conta.">
      <div className="space-y-5">
        <Field
          id="password"
          label="Nova senha"
          icon={Lock}
          revealable
          value={password}
          onChange={setPassword}
          placeholder="Crie uma senha forte"
          autoComplete="new-password"
        />
        <Field
          id="confirm"
          label="Confirmar senha"
          icon={Lock}
          revealable
          value={confirm}
          onChange={setConfirm}
          placeholder="Repita a senha"
          autoComplete="new-password"
        />

        <AnimatePresence>
          {password.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-1 gap-1.5 sm:grid-cols-3"
            >
              {rules.map((rule) => (
                <li
                  key={rule.label}
                  className={`flex items-center gap-1.5 text-xs transition-colors ${
                    rule.ok ? "text-ink dark:text-paper" : "text-paper-400"
                  }`}
                >
                  <span
                    className={`grid size-4 place-items-center rounded-full transition-colors ${
                      rule.ok ? "bg-ink text-paper" : "bg-paper-200 dark:bg-ink-700"
                    }`}
                  >
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                  {rule.label}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 rounded-lg bg-ink/5 px-3 py-2.5 text-sm text-ink dark:text-paper"
            >
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <SubmitButton
          label="Redefinir senha"
          loading={mutation.isPending}
          onClick={handleSubmit}
        />

        <Link
          to="/login"
          className="flex items-center justify-center gap-2 text-sm font-medium text-ink dark:text-paper underline-offset-4 hover:underline"
        >
          Voltar para o login
        </Link>
      </div>
    </AuthLayout>
  )
}
