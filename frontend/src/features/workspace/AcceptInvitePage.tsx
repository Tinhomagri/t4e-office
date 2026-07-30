import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { useAuthStore } from "@/features/auth/auth.store"
import { Button, Spinner } from "@/shared/ui/primitives"
import { acceptInvitation, getInvitationPreview, type InvitationPreview } from "./workspace.api"
import { rememberPendingInvite } from "./pendingInvite"
import { useWorkspaceStore } from "./workspace.store"

type State = "working" | "ok" | "error" | "needs-login" | "wrong-account"

export function AcceptInvitePage() {
  const [params] = useSearchParams()
  const token = params.get("token")
  const accessToken = useAuthStore((s) => s.accessToken)
  const currentUser = useAuthStore((s) => s.user)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [state, setState] = useState<State>("working")
  const [message, setMessage] = useState("")
  const [invite, setInvite] = useState<InvitationPreview | null>(null)

  useEffect(() => {
    if (!token) {
      setState("error")
      setMessage("Link de convite inválido (sem token).")
      return
    }

    let cancelled = false

    // O preview vem primeiro mesmo quando já há sessão: sem ele não é possível
    // dizer se a pessoa está logada na conta certa, e o erro do backend ("enviado
    // para outro email") não informa qual conta usar.
    getInvitationPreview(token)
      .then((preview) => {
        if (cancelled) return
        setInvite(preview)

        if (preview.status !== "pending") {
          setState("error")
          setMessage(
            preview.status === "accepted"
              ? "Este convite já foi aceito."
              : "Este convite foi revogado. Peça um novo ao administrador.",
          )
          return
        }

        if (!accessToken) {
          setState("needs-login")
          return
        }

        // Logado com outra conta: aceitar daria 403. Melhor dizer de quem é o
        // convite do que deixar o backend recusar sem explicar.
        const mine = currentUser?.email?.toLowerCase() === preview.email.toLowerCase()
        if (!mine) {
          setState("wrong-account")
          return
        }

        return acceptInvitation(token).then((res) => {
          if (cancelled) return
          setActiveWorkspace(res.workspace_id)
          qc.invalidateQueries({ queryKey: ["workspaces"] })
          setState("ok")
          setTimeout(() => navigate("/app/boards"), 1200)
        })
      })
      .catch((e) => {
        if (cancelled) return
        setState("error")
        setMessage(errMsg(e))
      })

    return () => {
      cancelled = true
    }
  }, [token, accessToken, currentUser, setActiveWorkspace, qc, navigate])

  /** Volta para cá depois de autenticar, sem a pessoa reabrir o e-mail. */
  const backHere = `/invite?token=${encodeURIComponent(token ?? "")}`
  const authPath = (base: string) =>
    `${base}?email=${encodeURIComponent(invite?.email ?? "")}&next=${encodeURIComponent(backHere)}`

  /** Guarda o convite antes de sair: o login com Google perde a query string. */
  const goToAuth = (base: string) => {
    if (token) rememberPendingInvite(token)
    navigate(authPath(base))
  }

  return (
    // Superfície própria. Esta rota vive fora do AppShell: sem `bg` aqui, o tema
    // escuro aplicava `dark:text-paper` (texto claro) sobre o fundo claro do
    // body — título e botões ficavam invisíveis.
    <div className="min-h-screen bg-canvas dark:bg-ink-950">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-lg font-semibold text-ink dark:text-paper">
          {invite ? `Convite para ${invite.workspace_name}` : "Convite para workspace"}
        </h1>

        {state === "working" && (
          <p className="flex items-center gap-2 text-sm text-paper-500">
            <Spinner className="size-4" /> Verificando convite…
          </p>
        )}

        {state === "ok" && (
          <p className="text-sm font-medium text-success">Convite aceito! Redirecionando…</p>
        )}

        {state === "needs-login" && invite && (
          <>
            <p className="text-sm text-paper-500">
              Este convite é para{" "}
              <strong className="text-ink dark:text-paper">{invite.email}</strong>.
            </p>

            {/* Um caminho só, decidido pelo backend. Dois botões lado a lado
                deixavam a escolha para quem não tem como saber a resposta. */}
            {invite.auth_method === "google" ? (
              <>
                <p className="text-sm text-paper-500">
                  Essa conta entra pelo Google — não tem senha cadastrada.
                </p>
                <Button onClick={() => goToAuth("/login")}>
                  Entrar com Google
                </Button>
              </>
            ) : invite.account_exists ? (
              <>
                <p className="text-sm text-paper-500">Você já tem conta. Entre para aceitar.</p>
                <Button onClick={() => goToAuth("/login")}>Entrar</Button>
              </>
            ) : (
              <>
                <p className="text-sm text-paper-500">
                  Ainda não há conta com esse e-mail. Crie a sua para aceitar.
                </p>
                <Button onClick={() => goToAuth("/register")}>Criar conta</Button>
              </>
            )}
          </>
        )}

        {state === "wrong-account" && invite && (
          <>
            <p className="text-sm text-paper-500">
              Você está conectado como{" "}
              <strong className="text-ink dark:text-paper">{currentUser?.email}</strong>, mas este
              convite é para{" "}
              <strong className="text-ink dark:text-paper">{invite.email}</strong>.
            </p>
            <Button
              onClick={() => {
                useAuthStore.getState().clear()
                goToAuth("/login")
              }}
            >
              Sair e entrar com {invite.email}
            </Button>
          </>
        )}

        {state === "error" && (
          <>
            <p className="text-sm text-danger">{message}</p>
            <Link
              to="/app/boards"
              className="text-sm text-ink underline dark:text-paper"
            >
              Ir para o app
            </Link>
          </>
        )}
      </div>
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
