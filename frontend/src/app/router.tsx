import { Navigate, createBrowserRouter } from "react-router-dom"

import { useAuthStore } from "@/features/auth/auth.store"
import { AppShell } from "@/features/shell/AppShell"
import { AvatarLabPage } from "@/features/avatar/AvatarLabPage"
import { BoardsPage } from "@/features/boards/BoardsPage"
import { BoardSettingsPage } from "@/features/boards/settings/BoardSettingsPage"
import { CopilotPage } from "@/features/copilot/CopilotPage"
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage"
import { GoogleCallbackPage } from "@/features/auth/GoogleCallbackPage"
import { IntegrationsPage } from "@/features/integrations/IntegrationsPage"
import { MeetingsPage } from "@/features/meetings/MeetingsPage"
import { ChatPage } from "@/features/chat/ChatPage"
import { LoginPage } from "@/features/auth/LoginPage"
import { EditorialCalendarPage } from "@/features/marketing/EditorialCalendarPage"
import { MarketingDeck } from "@/features/marketing/MarketingDeck"
import { PublishQueuePage } from "@/features/marketing/PublishQueuePage"
import { SocialAccountsPage } from "@/features/marketing/SocialAccountsPage"
import { SocialAnalyticsPage } from "@/features/marketing/SocialAnalyticsPage"
import { AcceptInvitePage } from "@/features/workspace/AcceptInvitePage"
import { MembersPage } from "@/features/workspace/members/MembersPage"
import { MyDayPage } from "@/features/today/MyDayPage"
import { DesksManagerPage } from "@/features/office/desks/DesksManagerPage"
import { MyCardPage } from "@/features/office/mycard/MyCardPage"
import { OfficePage } from "@/features/office/OfficePage"
import { PokerPage } from "@/features/poker/PokerPage"
import { PortfolioPage } from "@/features/portfolio/PortfolioPage"
import { ProjectPortfolioPage } from "@/features/portfolio/ProjectPortfolioPage"
import { RegisterPage } from "@/features/auth/RegisterPage"
import { ReportsPage } from "@/features/reports/ReportsPage"
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage"
import { DashboardDeck } from "@/features/sales/deck/DashboardDeck"
import { SalesLayout } from "@/features/sales/SalesLayout"
import {
  ActivitiesRoute,
  CustomersRoute,
  GoalsRoute,
  InboxRoute,
  LeadsRoute,
  PipelineRoute,
  ProposalsRoute,
} from "@/features/sales/sales.routes"
import { VerifyEmailPage } from "@/features/auth/VerifyEmailPage"
import type { ReactNode } from "react"
import type { RouteObject } from "react-router-dom"

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

/**
 * Rotas de dentro do `/app` — o miolo do produto, sem o guarda de sessão.
 *
 * Exportado porque o PC do escritório monta o MESMO sistema (AppShell + estas
 * rotas) num router de memória. Duplicar a lista faria a janela do Win98
 * envelhecer sozinha: rota nova no app não apareceria lá dentro.
 */
export const appRoutes: RouteObject[] = [
  { index: true, element: <MyDayPage /> },
  { path: "boards", element: <BoardsPage /> },
  { path: "boards/:projectId/settings", element: <BoardSettingsPage /> },
  { path: "members", element: <MembersPage /> },
  { path: "poker", element: <PokerPage /> },
  { path: "poker/:sessionId", element: <PokerPage /> },
  {
    path: "comercial",
    element: <SalesLayout />,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: "dashboard", element: <DashboardDeck /> },
      { path: "leads", element: <LeadsRoute /> },
      { path: "pipeline", element: <PipelineRoute /> },
      { path: "clientes", element: <CustomersRoute /> },
      { path: "atendimento", element: <InboxRoute /> },
      { path: "atividades", element: <ActivitiesRoute /> },
      { path: "propostas", element: <ProposalsRoute /> },
      { path: "metas", element: <GoalsRoute /> },
    ],
  },
  { path: "reports", element: <ReportsPage /> },
  { path: "portfolio", element: <PortfolioPage /> },
  { path: "portfolio/:projectId", element: <ProjectPortfolioPage /> },
  { path: "integrations", element: <IntegrationsPage /> },
  { path: "reunioes", element: <MeetingsPage /> },
  { path: "chat", element: <ChatPage /> },
  { path: "desks", element: <DesksManagerPage /> },
  // Meu Card nasceu no PC do escritório, mas é uma tela do produto como outra
  // qualquer — ter rota é o que deixa o PC abri-la pelo mesmo caminho.
  { path: "my-card", element: <MyCardPage /> },
  // Marketing também abre no deck; o calendário passa a ser uma rota interna.
  { path: "marketing", element: <MarketingDeck /> },
  { path: "marketing/calendario", element: <EditorialCalendarPage /> },
  { path: "marketing/fila", element: <PublishQueuePage /> },
  { path: "marketing/analytics", element: <SocialAnalyticsPage /> },
  { path: "marketing/redes", element: <SocialAccountsPage /> },
  { path: "avatar", element: <AvatarLabPage /> },
  { path: "copilot", element: <CopilotPage /> },
]

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
    children: appRoutes,
  },
  {
    // Fora do AppShell de propósito: o Escritório é uma cena 3D de andar/sala
    // que ocupa a tela inteira — header e sidebar por cima cortavam área útil
    // e não faziam sentido sobre um ambiente imersivo. Mantém RequireAuth
    // porque a rota ainda é privada.
    path: "/app/office",
    element: (
      <RequireAuth>
        <OfficePage />
      </RequireAuth>
    ),
  },
])
