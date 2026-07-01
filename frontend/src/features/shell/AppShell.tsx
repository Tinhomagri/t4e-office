import { motion } from "framer-motion"
import {
  Bell,
  Building2,
  CalendarClock,
  Check,
  ChevronsUpDown,
  LayoutDashboard,
  LineChart,
  LogOut,
  Moon,
  type LucideIcon,
  Plus,
  Search,
  Settings,
  Smile,
  Sparkles,
  Spade,
  SquareKanban,
  Sun,
  UserPlus,
  Users,
} from "lucide-react"
import { useState } from "react"
import { useThemeStore } from "@/shared/theme.store"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"

import { useAuthStore } from "@/features/auth/auth.store"
import { useCreateWorkspace, useWorkspaces } from "@/features/workspace/workspace.hooks"
import {
  Avatar,
  Button,
  Field,
  IconButton,
  Input,
  Kbd,
  Modal,
  PRESENCE_LABEL,
  SectionLabel,
  StatusDot,
  cx,
} from "@/shared/ui/primitives"
import type { PresenceStatus } from "@/features/workspace/workspace.types"

interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
}

// Menu espelha os pilares do doc de visão: trabalho, inteligência, equipe.
const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Trabalho",
    items: [
      { label: "Meu Dia", to: "/app", icon: LayoutDashboard, end: true },
      { label: "Boards", to: "/app/boards", icon: SquareKanban },
      { label: "Planning Poker", to: "/app/poker", icon: Spade },
      { label: "Reuniões", to: "/app/integrations", icon: CalendarClock },
    ],
  },
  {
    heading: "Inteligência",
    items: [
      { label: "Relatórios", to: "/app/reports", icon: LineChart },
      { label: "Portfólio", to: "/app/portfolio", icon: Building2 },
      { label: "Copiloto", to: "/app/copilot", icon: Sparkles },
    ],
  },
  {
    heading: "Equipe",
    items: [
      { label: "Membros", to: "/app/members", icon: UserPlus },
      { label: "Escritório", to: "/app/office", icon: Users },
      { label: "Avatar", to: "/app/avatar", icon: Smile },
    ],
  },
]

const PRESENCE_ORDER: PresenceStatus[] = ["available", "focus", "meeting", "away"]

function initials(name?: string) {
  if (!name) return "?"
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("")
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  const [status, setStatus] = useState<PresenceStatus>("available")

  const { theme, toggle: toggleTheme } = useThemeStore()

  const handleLogout = () => {
    clear()
    navigate("/login")
  }

  // Presença sem vigilância: o próprio usuário controla o que mostra
  const cycleStatus = () =>
    setStatus(PRESENCE_ORDER[(PRESENCE_ORDER.indexOf(status) + 1) % PRESENCE_ORDER.length])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas dark:bg-ink-950 text-ink dark:text-paper">
      {/* ---------------- Sidebar ---------------- */}
      <aside className="hidden w-[264px] shrink-0 flex-col bg-gradient-to-b from-ink-900 to-ink-950 dark:from-ink-950 dark:to-[#070709] md:flex">
        <WorkspaceSwitcher />

        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5 scrollbar-slim-dark">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading}>
              <div className="px-3 pb-2">
                <SectionLabel>{group.heading}</SectionLabel>
              </div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cx(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-white/[0.07] font-medium text-paper"
                          : "text-paper-400 hover:bg-white/[0.04] hover:text-paper-200",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* indicador de acento na borda esquerda */}
                        <span
                          className={cx(
                            "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-500 transition-opacity",
                            isActive ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <item.icon
                          className={cx(
                            "size-[18px] transition-colors",
                            isActive ? "text-brand-300" : "text-paper-500 group-hover:text-paper-300",
                          )}
                          strokeWidth={1.9}
                        />
                        <span className="flex-1 text-left">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer de usuário */}
        <div className="border-t border-white/5 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Avatar initials={initials(user?.full_name)} status={status} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-paper">
                {user?.full_name ?? "Usuário"}
              </p>
              <p className="truncate text-xs text-paper-500">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sair"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-paper-500 transition-colors hover:bg-white/5 hover:text-paper-200"
            >
              <LogOut className="size-[17px]" strokeWidth={1.9} />
            </button>
          </div>
        </div>
      </aside>

      {/* ---------------- Coluna principal ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-paper-200 dark:border-ink-800 bg-paper/80 dark:bg-ink-900/80 px-6 backdrop-blur-xl">
          <button className="group flex h-10 max-w-md flex-1 items-center gap-2.5 rounded-xl border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-800 px-3.5 text-left text-sm text-paper-400 transition-colors hover:border-paper-300 dark:hover:border-ink-600 hover:bg-paper-100 dark:hover:bg-ink-700 focus-ring">
            <Search className="size-4 shrink-0" strokeWidth={1.9} />
            <span className="flex-1 truncate">Buscar cards, projetos, pessoas…</span>
            <Kbd>⌘K</Kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={cycleStatus}
              title="Clique para mudar seu status"
              className="flex items-center gap-2 rounded-full border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 px-3 py-1.5 text-xs font-medium text-ink dark:text-paper transition-colors hover:bg-paper-100 dark:hover:bg-ink-700 focus-ring"
            >
              <StatusDot status={status} />
              {PRESENCE_LABEL[status]}
            </button>

            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              className="grid size-9 place-items-center rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 text-paper-500 dark:text-paper-400 transition-colors hover:bg-paper-100 dark:hover:bg-ink-700"
            >
              {theme === "dark" ? <Sun className="size-[17px]" strokeWidth={1.9} /> : <Moon className="size-[17px]" strokeWidth={1.9} />}
            </button>

            <IconButton className="relative" title="Notificações">
              <Bell className="size-[18px]" strokeWidth={1.9} />
              <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-brand-500 ring-2 ring-paper dark:ring-ink-900" />
            </IconButton>
            <IconButton title="Configurações">
              <Settings className="size-[18px]" strokeWidth={1.9} />
            </IconButton>
          </div>
        </header>

        {/* Conteúdo rolável */}
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 overflow-y-auto px-6 py-7 scrollbar-slim dark:bg-ink-950"
        >
          <div
            className={cx(
              "w-full",
              location.pathname !== "/app" &&
                !location.pathname.startsWith("/app/boards") &&
                "mx-auto max-w-6xl",
            )}
          >
            <Outlet />
          </div>
        </motion.main>
      </div>
    </div>
  )
}

// Seletor de workspace no topo da sidebar — mostra o ativo e permite trocar.
function WorkspaceSwitcher() {
  const { data: workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaces()
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const active = workspaces?.find((w) => w.id === activeWorkspaceId) ?? workspaces?.[0]
  const tile = (active?.name ?? "Pulse").trim().charAt(0).toUpperCase()

  return (
    <div className="relative border-b border-white/5 p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.05] focus-ring"
      >
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white shadow-brand-glow">
          {tile}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-paper">
            {active?.name ?? "Pulse"}
          </p>
          <p className="truncate text-[11px] tracking-[0.16em] text-paper-500">
            T4E GROUP
          </p>
        </div>
        <ChevronsUpDown className="size-4 shrink-0 text-paper-500" strokeWidth={1.9} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-3 right-3 top-[64px] z-20 animate-scale-in rounded-xl border border-white/10 bg-ink-800 p-1.5 shadow-pop">
            <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-paper-500">
              Seus workspaces
            </p>
            {(workspaces ?? []).map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  setActiveWorkspace(w.id)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-paper-200 transition-colors hover:bg-white/5"
              >
                <div className="grid size-6 place-items-center rounded-md bg-white/10 text-[11px] font-semibold text-paper">
                  {w.name.trim().charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 truncate">{w.name}</span>
                {w.id === activeWorkspaceId && (
                  <Check className="size-4 text-brand-300" strokeWidth={2.2} />
                )}
              </button>
            ))}
            <div className="my-1 h-px bg-white/5" />
            <button
              onClick={() => {
                setOpen(false)
                setCreateOpen(true)
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-paper-400 transition-colors hover:bg-white/5 hover:text-paper-200"
            >
              <div className="grid size-6 place-items-center rounded-md border border-dashed border-white/20">
                <Plus className="size-3.5" />
              </div>
              Criar workspace
            </button>
          </div>
        </>
      )}

      <NewWorkspaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

// Modal de criação de workspace — define como ativo e fecha ao concluir.
function NewWorkspaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createWorkspace = useCreateWorkspace()
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      await createWorkspace.mutateAsync(name.trim())
      setName("")
      onClose()
    } catch (e) {
      const anyE = e as { response?: { data?: { error?: string; detail?: string } } }
      setError(
        anyE?.response?.data?.error ??
          anyE?.response?.data?.detail ??
          "Não foi possível criar o workspace.",
      )
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Criar workspace"
      description="Um workspace agrupa seus projetos, sprints, cards e a equipe."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={createWorkspace.isPending} disabled={!name.trim()}>
            Criar workspace
          </Button>
        </>
      }
    >
      <Field label="Nome do workspace">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: T4E Group"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) submit()
          }}
        />
      </Field>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Modal>
  )
}
