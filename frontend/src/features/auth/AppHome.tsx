import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"

import { useAuthStore } from "./auth.store"

// Placeholder pós-login. Será substituído pela área de workspaces/projetos.
export function AppHome() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)

  const handleLogout = () => {
    clear()
    navigate("/login")
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-ink">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <p className="text-sm tracking-[0.3em] text-paper-500">T4E OFFICE</p>
        <h1 className="mt-4 text-3xl font-bold text-paper">
          Olá, {user?.full_name ?? "bem-vindo"}.
        </h1>
        <p className="mt-2 text-paper-400">
          Sua Fundação está no ar. Próximo passo: criar um workspace.
        </p>
        <button
          onClick={handleLogout}
          className="mt-8 rounded-full border border-paper/30 px-5 py-2 text-sm text-paper-300 transition-colors hover:bg-paper/10"
        >
          Sair
        </button>
      </motion.div>
    </div>
  )
}
