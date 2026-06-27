import { Navigate, createBrowserRouter } from "react-router-dom"

import { useAuthStore } from "@/features/auth/auth.store"
import { AppShell } from "@/features/shell/AppShell"
import { AvatarLabPage } from "@/features/avatar/AvatarLabPage"
import { BoardsPage } from "@/features/boards/BoardsPage"
import { CopilotPage } from "@/features/copilot/CopilotPage"
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage"
import { LoginPage } from "@/features/auth/LoginPage"
import { AcceptInvitePage } from "@/features/workspace/AcceptInvitePage"
import { MembersPage } from "@/features/workspace/MembersPage"
import { MyDayPage } from "@/features/today/MyDayPage"
import { OfficePage } from "@/features/office/OfficePage"
import { PokerPage } from "@/features/poker/PokerPage"
import { PortfolioPage } from "@/features/portfolio/PortfolioPage"
import { RegisterPage } from "@/features/auth/RegisterPage"
import { ReportsPage } from "@/features/reports/ReportsPage"
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage"
import { VerifyEmailPage } from "@/features/auth/VerifyEmailPage"
import type { ReactNode } from "react"

// Protege rotas privadas: sem token -> volta para o login
function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.accessToken)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
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
      { path: "reports", element: <ReportsPage /> },
      { path: "portfolio", element: <PortfolioPage /> },
      { path: "office", element: <OfficePage /> },
      { path: "avatar", element: <AvatarLabPage /> },
      { path: "copilot", element: <CopilotPage /> },
    ],
  },
])
