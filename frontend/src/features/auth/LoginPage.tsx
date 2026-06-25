import { useMutation } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, Lock, Mail } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { extractApiError } from "@/shared/api/client"
import { Field } from "@/shared/ui/Field"
import { SubmitButton } from "@/shared/ui/SubmitButton"

import { fetchMe, login } from "./auth.api"
import { AuthLayout } from "./AuthLayout"
import { useAuthStore } from "./auth.store"

export function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const setUser = useAuthStore((s) => s.setUser)

  const [email, setEmail] = useState("")
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
    onSuccess: () => navigate("/app"),
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

        {/* Lembrar + esqueceu senha */}
        <div className="flex items-center justify-between">
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
            className="text-sm font-medium text-ink underline-offset-4 hover:underline"
          >
            Esqueceu a senha?
          </Link>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 rounded-lg bg-ink/5 px-3 py-2.5 text-sm text-ink"
            >
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <SubmitButton
          label="Entrar"
          loading={mutation.isPending}
          onClick={handleSubmit}
        />

        <p className="pt-2 text-center text-sm text-paper-500">
          Não tem conta?{" "}
          <Link
            to="/register"
            className="font-semibold text-ink underline-offset-4 hover:underline"
          >
            Criar agora
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
