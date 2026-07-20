import { Navigate, createBrowserRouter } from "react-router-dom"

import { useAuthStore } from "@/features/auth/auth.store"
import { AppShell } from "@/features/shell/AppShell"
import { AvatarLabPage } from "@/features/avatar/AvatarLabPage"
import { BoardsPage } from "@/features/boards/BoardsPage"
import { CopilotPage } from "@/features/copilot/CopilotPage"
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage"
import { GoogleCallbackPage } from "@/features/auth/GoogleCallbackPage"
import { IntegrationsPage } from "@/features/integrations/IntegrationsPage"
import { LoginPage } from "@/features/auth/LoginPage"
import { EditorialCalendarPage } from "@/features/marketing/EditorialCalendarPage"
import { ImportBoardPage } from "@/features/marketing/ImportBoardPage"
import { PublishQueuePage } from "@/features/marketing/PublishQueuePage"
import { SocialAccountsPage } from "@/features/marketing/SocialAccountsPage"
import { SocialAnalyticsPage } from "@/features/marketing/SocialAnalyticsPage"
import { AcceptInvitePage } from "@/features/workspace/AcceptInvitePage"
import { MembersPage } from "@/features/workspace/members/MembersPage"
import { MyDayPage } from "@/features/today/MyDayPage"
import { OfficePage } from "@/features/office/OfficePage"
import { PokerPage } from "@/features/poker/PokerPage"
import { PortfolioPage } from "@/features/portfolio/PortfolioPage"
import { ProjectPortfolioPage } from "@/features/portfolio/ProjectPortfolioPage"
import { RegisterPage } from "@/features/auth/RegisterPage"
import { ReportsPage } from "@/features/reports/ReportsPage"
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage"
import { VerifyEmailPage } from "@/features/auth/VerifyEmailPage"
import type { ReactNode } from "react"

// Decodifica o `exp` (epoch em segundos) de um JWT, sem dependência externa.
// Retorna null se o token não for um JWT válido/decodificável.
function jwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    return typeof payload.exp === "number" ? payload.exp : null
  } catch {
    return null
  }
}

function isExpired(token: string | null): boolean {
  if (!token) return true
  const exp = jwtExp(token)
  // Sem exp legível → trata como inválido (expirado) por segurança.
  if (exp == null) return true
  return exp * 1000 <= Date.now()
}

// Protege rotas privadas. Redireciona ao login quando:
//  - não há access token; ou
//  - o access expirou E não há refresh válido para recuperá-lo.
// (Se o access expirou mas o refresh ainda vale, deixa passar: o interceptor
//  renova silenciosamente na primeira chamada à API.)
function RequireAuth({ children }: { children: ReactNode }) {
  const access = useAuthStore((s) => s.accessToken)
  const refresh = useAuthStore((s) => s.refreshToken)
  const clear = useAuthStore((s) => s.clear)

  if (!access) return <Navigate to="/login" replace />

  if (isExpired(access) && isExpired(refresh)) {
    // Sessão irrecuperável: limpa tokens velhos e manda para o login.
    clear()
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/login/google/callback", element: <GoogleCallbackPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/verify-email", element: <VerifyEmailPage /> },
  { path: "/invite", element: <AcceptInvitePage /> },
  {
    path: "/app",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <MyDayPage /> },
      { path: "boards", element: <BoardsPage /> },
      { path: "members", element: <MembersPage /> },
      { path: "poker", element: <PokerPage /> },
      { path: "poker/:sessionId", element: <PokerPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "portfolio", element: <PortfolioPage /> },
      { path: "portfolio/:projectId", element: <ProjectPortfolioPage /> },
      { path: "office", element: <OfficePage /> },
      { path: "integrations", element: <IntegrationsPage /> },
      { path: "marketing/calendario", element: <EditorialCalendarPage /> },
      { path: "marketing/fila", element: <PublishQueuePage /> },
      { path: "marketing/analytics", element: <SocialAnalyticsPage /> },
      { path: "marketing/redes", element: <SocialAccountsPage /> },
      { path: "importar", element: <ImportBoardPage /> },
      { path: "avatar", element: <AvatarLabPage /> },
      { path: "copilot", element: <CopilotPage /> },
    ],
  },
])
