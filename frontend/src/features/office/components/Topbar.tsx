import { useAuthStore } from "@/features/auth/auth.store"
import { useNavigate } from "react-router-dom"

export function Topbar() {
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  const navigate = useNavigate()

  return (
    <header className="h-14 flex items-center px-4 bg-white/90 backdrop-blur border-b border-gray-200 z-30 flex-shrink-0">
      <div className="flex items-center gap-2">
        <div className="bg-[#1a1a1a] text-white font-black text-xs px-2 py-1 rounded-md">T4E</div>
        <span className="font-bold text-sm text-gray-800">Escritório T4E</span>
      </div>
      <div className="ml-auto flex items-center gap-4">
        <span className="text-sm text-gray-600">{user?.full_name}</span>
        <button
          onClick={() => { clear(); navigate("/login") }}
          className="text-xs text-gray-400 hover:text-gray-700 transition"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
