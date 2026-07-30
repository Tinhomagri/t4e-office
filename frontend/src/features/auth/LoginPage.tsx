import { useMutation } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, Lock, Mail } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { extractApiError } from "@/shared/api/client"
import { fadeUpItem, revealCollapse, staggerContainer } from "@/shared/lib/motion"
import { Field } from "@/shared/ui/Field"
import { SubmitButton } from "@/shared/ui/SubmitButton"

import { fetchMe, login } from "./auth.api"
import { AuthLayout } from "./AuthLayout"
import { useAuthStore } from "./auth.store"
import { GoogleButton } from "./GoogleButton"

export function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const setUser = useAuthStore((s) => s.setUser)

  // Vindo de um convite: o e-mail já é conhecido e o destino é voltar para o
  // link do convite, não para /app — senão a pessoa precisa reabrir o e-mail.
  const [params] = useSearchParams()
  const next = params.get("next")
  const [email, setEmail] = useState(params.get("email") ?? "")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const tokens = await login({ email, password })
      setSession(tokens)
      const user = await fetchMe()
      setUser(user)
    },
    onSuccess: () => navigate(next ?? "/app"),
    onError: (err) => setError(extractApiError(err)),
  })

  const handleSubmit = () => {
    setError(null)
    if (!email.trim() || !password) {
      setError("Informe email e senha.")
      return
    }
    mutation.mutate()
  }

  return (
    <AuthLayout title="Bem-vindo de volta" subtitle="Entre para acessar seu espaço de trabalho.">
      <motion.div
        className="space-y-5"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={fadeUpItem}>
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
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <Field
            id="password"
            label="Senha"
            icon={Lock}
            revealable
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </motion.div>

        {/* Lembrar + esqueceu senha */}
        <motion.div variants={fadeUpItem} className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-paper-500">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 rounded border-ink/30 accent-ink"
            />
            Lembrar de mim
          </label>
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-ink dark:text-paper underline-offset-4 hover:underline"
          >
            Esqueceu a senha?
          </Link>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              variants={revealCollapse}
              initial="hidden"
              animate="show"
              exit="exit"
              className="flex items-center gap-2 overflow-hidden rounded-lg bg-ink/5 px-3 py-2.5 text-sm text-ink dark:text-paper"
            >
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div variants={fadeUpItem}>
          <SubmitButton
            label="Entrar"
            loading={mutation.isPending}
            onClick={handleSubmit}
          />
        </motion.div>

        <motion.div variants={fadeUpItem} className="flex items-center gap-3 py-1">
          <div className="h-px flex-1 bg-ink/10 dark:bg-paper/10" />
          <span className="text-xs uppercase tracking-wide text-paper-400">ou</span>
          <div className="h-px flex-1 bg-ink/10 dark:bg-paper/10" />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <GoogleButton label="Entrar com Google" />
        </motion.div>

        <motion.p variants={fadeUpItem} className="pt-2 text-center text-sm text-paper-500">
          Não tem conta?{" "}
          <Link
            to="/register"
            className="font-semibold text-ink dark:text-paper underline-offset-4 hover:underline"
          >
            Criar agora
          </Link>
        </motion.p>
      </motion.div>
    </AuthLayout>
  )
}
