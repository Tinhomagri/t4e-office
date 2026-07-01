import { useMutation } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, Check, Lock, Mail, User } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { extractApiError } from "@/shared/api/client"
import { Field } from "@/shared/ui/Field"
import { SubmitButton } from "@/shared/ui/SubmitButton"

import { fetchMe, login, register } from "./auth.api"
import { AuthLayout } from "./AuthLayout"
import { useAuthStore } from "./auth.store"

// Regras de senha exibidas ao vivo (espelham a validação do backend)
function passwordRules(password: string) {
  return [
    { label: "Ao menos 8 caracteres", ok: password.length >= 8 },
    { label: "Uma letra", ok: /[a-zA-Z]/.test(password) },
    { label: "Um número", ok: /\d/.test(password) },
  ]
}

export function RegisterPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const setUser = useAuthStore((s) => s.setUser)

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  const rules = useMemo(() => passwordRules(password), [password])
  const passwordValid = rules.every((r) => r.ok)

  const mutation = useMutation({
    mutationFn: async () => {
      await register({ email, full_name: fullName, password })
      // Autentica o usuário recém-criado
      const tokens = await login({ email, password })
      setSession(tokens)
      const user = await fetchMe()
      setUser(user)
    },
    onSuccess: () => navigate("/app"),
    onError: (err) => setError(extractApiError(err)),
  })

  const handleSubmit = () => {
    setError(null)
    if (!fullName.trim()) {
      setError("Informe seu nome completo.")
      return
    }
    if (!email.trim()) {
      setError("Informe um email válido.")
      return
    }
    if (!passwordValid) {
      setError("A senha não atende aos requisitos.")
      return
    }
    mutation.mutate()
  }

  return (
    <AuthLayout title="Criar sua conta" subtitle="Leva menos de um minuto para começar.">
      <div className="space-y-5">
        <Field
          id="fullName"
          label="Nome completo"
          icon={User}
          value={fullName}
          onChange={setFullName}
          placeholder="Maria Souza"
          autoComplete="name"
        />
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
        <Field
          id="password"
          label="Senha"
          icon={Lock}
          revealable
          value={password}
          onChange={setPassword}
          placeholder="Crie uma senha forte"
          autoComplete="new-password"
        />

        {/* Requisitos de senha ao vivo */}
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
          label="Criar conta"
          loading={mutation.isPending}
          onClick={handleSubmit}
        />

        {/* Aviso legal */}
        <p className="text-center text-xs leading-relaxed text-paper-400">
          Ao criar uma conta, você concorda com os{" "}
          <span className="text-paper-500 underline-offset-2">Termos de Uso</span> e
          a <span className="text-paper-500 underline-offset-2">Política de Privacidade</span>.
        </p>

        <p className="text-center text-sm text-paper-500">
          Já tem conta?{" "}
          <Link
            to="/login"
            className="font-semibold text-ink dark:text-paper underline-offset-4 hover:underline"
          >
            Entrar
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
