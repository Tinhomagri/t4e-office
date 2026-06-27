import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { useAuthStore } from "@/features/auth/auth.store"
import { acceptInvitation } from "./workspace.api"
import { useWorkspaceStore } from "./workspace.store"

type State = "working" | "ok" | "error" | "no-auth"

export function AcceptInvitePage() {
  const [params] = useSearchParams()
  const token = params.get("token")
  const accessToken = useAuthStore((s) => s.accessToken)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [state, setState] = useState<State>("working")
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!token) {
      setState("error")
      setMessage("Link de convite inválido (sem token).")
      return
    }
    if (!accessToken) {
      setState("no-auth")
      return
    }
    acceptInvitation(token)
      .then((res) => {
        setActiveWorkspace(res.workspace_id)
        qc.invalidateQueries({ queryKey: ["workspaces"] })
        setState("ok")
        setTimeout(() => navigate("/app/boards"), 1200)
      })
      .catch((e) => {
        setState("error")
        setMessage(errMsg(e))
      })
  }, [token, accessToken, setActiveWorkspace, qc, navigate])

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold text-ink">Convite para workspace</h1>

      {state === "working" && <p className="text-sm text-paper-500">Aceitando convite…</p>}

      {state === "ok" && (
        <p className="text-sm text-green-700">Convite aceito! Redirecionando…</p>
      )}

      {state === "no-auth" && (
        <>
          <p className="text-sm text-paper-500">
            Entre ou crie sua conta com o <strong>mesmo email</strong> do convite para aceitá-lo.
            Depois, abra este link novamente.
          </p>
          <div className="flex gap-2">
            <Link
              to="/login"
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper"
            >
              Entrar
            </Link>
            <Link
              to="/register"
              className="rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink"
            >
              Criar conta
            </Link>
          </div>
        </>
      )}

      {state === "error" && (
        <>
          <p className="text-sm text-red-600">{message}</p>
          <Link to="/app/boards" className="text-sm text-ink underline">
            Ir para o app
          </Link>
        </>
      )}
    </div>
  )
}

function errMsg(e: unknown): string {
  const anyE = e as { response?: { data?: { error?: string; detail?: string } } }
  return (
    anyE?.response?.data?.error ??
    anyE?.response?.data?.detail ??
    "Não foi possível aceitar o convite."
  )
}
