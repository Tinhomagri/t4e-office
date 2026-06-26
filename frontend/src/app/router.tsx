import { Navigate, createBrowserRouter } from "react-router-dom"
import { AppHome } from "@/features/auth/AppHome"
import { useAuthStore } from "@/features/auth/auth.store"
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage"
import { LoginPage } from "@/features/auth/LoginPage"
import { RegisterPage } from "@/features/auth/RegisterPage"
import { OfficePage } from "@/features/office/OfficePage"
import { AvatarCustomizer } from "@/features/avatar/AvatarCustomizer"
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
  {
    path: "/app",
    element: (
      <RequireAuth>
        <AppHome />
      </RequireAuth>
    ),
  },
  {
    path: "/onboarding",
    element: <RequireAuth><AvatarCustomizer /></RequireAuth>,
  },
  {
    path: "/office",
    element: <RequireAuth><OfficePage /></RequireAuth>,
  },
])
