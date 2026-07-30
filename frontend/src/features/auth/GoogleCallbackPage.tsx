import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { extractApiError } from "@/shared/api/client"

import { fetchMe } from "./auth.api"
import { AuthLayout } from "./AuthLayout"
import { useAuthStore } from "./auth.store"
import { takePendingInvite } from "@/features/workspace/pendingInvite"

const ERROR_MESSAGES: Record<string, string> = {
  denied: "Você cancelou o login com o Google.",
  invalid_state: "Sessão de login expirada. Tente novamente.",
  exchange_failed: "Não foi possível confirmar sua conta Google. Tente novamente.",
  no_email: "O Google não retornou um email verificado.",
}

// Recebe os tokens (ou erro) na query string vindos do backend e conclui a sessão.
export function GoogleCallbackPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const setSession = useAuthStore((s) => s.setSession)
  const setUser = useAuthStore((s) => s.setUser)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const errorCode = params.get("error")
    if (errorCode) {
      setError(ERROR_MESSAGES[errorCode] ?? "Falha ao entrar com o Google.")
      return
    }

    const access = params.get("access")
    const refresh = params.get("refresh")
    if (!access || !refresh) {
      setError("Resposta inválida do login com o Google.")
      return
    }

    setSession({ access, refresh })
    fetchMe()
      .then((user) => {
        setUser(user)
        // Voltou de um convite: retoma o fluxo em vez de largar em /app, onde a
        // pessoa teria de reabrir o e-mail para achar o link.
        const invite = takePendingInvite()
        navigate(invite ? `/invite?token=${encodeURIComponent(invite)}` : "/app", {
          replace: true,
        })
      })
      .catch((err) => setError(extractApiError(err)))
  }, [params, navigate, setSession, setUser])

  return (
    <AuthLayout title="Entrando com Google" subtitle="Só um instante…">
      <div className="space-y-4 text-sm text-paper-500">
        {error ? (
          <>
            <p className="text-ink dark:text-paper">{error}</p>
            <Link
              to="/login"
              className="font-semibold text-ink underline-offset-4 hover:underline dark:text-paper"
            >
              Voltar ao login
            </Link>
          </>
        ) : (
          <p>Confirmando sua conta…</p>
        )}
      </div>
    </AuthLayout>
  )
}
