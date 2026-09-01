import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { extractApiError } from "@/shared/api/client"
import { Button, Spinner } from "@/shared/ui/primitives"

import { useAuthStore } from "@/features/auth/auth.store"

import { createAuthorizationCode, getOAuthClient, type OAuthClientInfo } from "./oauth.api"

type State = "missing-params" | "needs-login" | "loading" | "ready" | "error" | "redirecting"

/**
 * Tela de consentimento do conector MCP (claude.ai → office).
 *
 * O claude.ai redireciona o navegador da pessoa pra cá com
 * `?client_id=&redirect_uri=&state=` pra perguntar "autorizar mcp.t4egroup.com.br
 * a agir como você?". Ao permitir, saímos de volta pro `redirect_uri` — que é
 * outro host — por isso as navegações de saída usam `window.location.href`,
 * nunca o router (que só sabe navegar dentro deste app).
 */
export function OAuthConsentPage() {
  const [params] = useSearchParams()
  const clientId = params.get("client_id")
  const redirectUri = params.get("redirect_uri")
  const state = params.get("state") ?? ""

  const accessToken = useAuthStore((s) => s.accessToken)

  const [pageState, setPageState] = useState<State>("loading")
  const [client, setClient] = useState<OAuthClientInfo | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!clientId || !redirectUri) {
      setPageState("missing-params")
      return
    }

    if (!accessToken) {
      setPageState("needs-login")
      return
    }

    let cancelled = false
    setPageState("loading")

    getOAuthClient(clientId)
      .then((info) => {
        if (cancelled) return
        setClient(info)
        setPageState("ready")
      })
      .catch((e) => {
        if (cancelled) return
        setError(extractApiError(e))
        setPageState("error")
      })

    return () => {
      cancelled = true
    }
  }, [clientId, redirectUri, accessToken])

  // Volta pra cá (com os mesmos parâmetros) depois de logar — mesmo mecanismo
  // que outras rotas públicas usam (`/login?next=`), lido pelo LoginPage.
  const backHere = `/oauth/consent?${params.toString()}`
  const loginHref = `/login?next=${encodeURIComponent(backHere)}`

  const handleAllow = () => {
    if (!clientId || !redirectUri) return
    setPageState("redirecting")
    createAuthorizationCode(clientId, redirectUri)
      .then(({ code }) => {
        const url = new URL(redirectUri)
        url.searchParams.set("code", code)
        url.searchParams.set("state", state)
        window.location.href = url.toString()
      })
      .catch((e) => {
        setError(extractApiError(e))
        setPageState("error")
      })
  }

  const handleCancel = () => {
    if (!redirectUri) return
    const url = new URL(redirectUri)
    url.searchParams.set("error", "access_denied")
    url.searchParams.set("state", state)
    window.location.href = url.toString()
  }

  return (
    <div className="min-h-screen bg-canvas dark:bg-ink-950">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-lg font-semibold text-ink dark:text-paper">Autorizar conector</h1>

        {pageState === "missing-params" && (
          <p className="text-sm text-danger">
            Link de autorização inválido (faltam parâmetros obrigatórios).
          </p>
        )}

        {pageState === "needs-login" && (
          <>
            <p className="text-sm text-paper-500">
              Entre na sua conta do T4E Office para continuar.
            </p>
            <Button onClick={() => (window.location.href = loginHref)}>Entrar</Button>
          </>
        )}

        {(pageState === "loading" || pageState === "redirecting") && (
          <p className="flex items-center gap-2 text-sm text-paper-500">
            <Spinner className="size-4" />
            {pageState === "redirecting" ? "Redirecionando…" : "Carregando…"}
          </p>
        )}

        {pageState === "error" && <p className="text-sm text-danger">{error}</p>}

        {pageState === "ready" && client && (
          <>
            <p className="text-sm text-paper-500">
              <strong className="text-ink dark:text-paper">
                {client.client_name || client.client_id}
              </strong>{" "}
              quer se conectar à sua conta do T4E Office. Ele terá acesso aos mesmos boards e
              projetos que sua conta já acessa.
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleCancel}>
                Cancelar
              </Button>
              <Button onClick={handleAllow}>Permitir</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
