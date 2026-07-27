import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  Bell,
  Menu,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  Moon,
  Megaphone,
  Plus,
  Search,
  Settings,
  SquareKanban,
  Sun,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useThemeStore } from "@/shared/theme.store"
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom"

import { useAuthStore } from "@/features/auth/auth.store"
import { CopilotChatWidget } from "@/features/copilot/CopilotChatWidget"
import { AgendaPanel } from "@/features/integrations/AgendaPanel"
import { useCreateWorkspace, useProjects, useWorkspaces } from "@/features/workspace/workspace.hooks"
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
import { EASE, springSnappy } from "@/shared/lib/motion"
import { useSpaceStore } from "./space.store"
import {
  COMMON_GROUP,
  type NavGroup,
  SPACES,
  type SpaceId,
  getSpace,
  spaceFromPath,
} from "./spaces"

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

// Reage a um media query (>= md). SSR-safe e com listener limpo.
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const on = () => setMatches(mql.matches)
    on()
    mql.addEventListener("change", on)
    return () => mql.removeEventListener("change", on)
  }, [query])
  return matches
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  const [status, setStatus] = useState<PresenceStatus>("available")
  const [agendaOpen, setAgendaOpen] = useState(false)
  const [collapsedRaw, setCollapsed] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)

  const reduce = useReducedMotion()

  // Space ativo: a rota manda quando pertence a um space; caso contrário vale o
  // último escolhido (rotas neutras como /app e /app/office).
  const storedSpace = useSpaceStore((s) => s.activeSpace)
  const setActiveSpace = useSpaceStore((s) => s.setActiveSpace)
  const routeSpace = spaceFromPath(location.pathname, location.search)
  const spaceId = routeSpace ?? storedSpace
  const space = useMemo(() => getSpace(spaceId), [spaceId])

  // Mantém o store em sincronia quando a navegação veio de link/URL direta.
  useEffect(() => {
    if (routeSpace && routeSpace !== storedSpace) setActiveSpace(routeSpace)
  }, [routeSpace, storedSpace, setActiveSpace])

  const isDesktop = useMediaQuery("(min-width: 768px)")
  // No mobile a sidebar vira drawer full-width → nunca "colapsada".
  const collapsed = isDesktop ? collapsedRaw : false

  // Fecha o drawer ao navegar (mudança de rota) e ao voltar pro desktop.
  useEffect(() => setMobileNav(false), [location.pathname])
  useEffect(() => {
    if (isDesktop) setMobileNav(false)
  }, [isDesktop])

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
      {/* Backdrop do drawer mobile */}
      <AnimatePresence>
        {mobileNav && (
          <motion.div
            key="nav-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setMobileNav(false)}
            className="fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>

      {/* ---------------- Sidebar (Jira: clara, colapsável; no mobile vira drawer) ---------------- */}
      <motion.aside
        animate={{ width: collapsed ? 68 : 264 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className={cx(
          "relative z-50 flex shrink-0 flex-col border-r border-paper-200 bg-paper dark:border-ink-800 dark:bg-ink-900",
          // Mobile: fixo, desliza da esquerda. Desktop: estático no fluxo.
          "fixed inset-y-0 left-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] [padding-bottom:env(safe-area-inset-bottom)] md:static md:z-auto md:translate-x-0 md:!transition-none",
          mobileNav ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0",
        )}
      >
        <WorkspaceSwitcher collapsed={collapsed} />
        <SpaceSwitcher collapsed={collapsed} spaceId={spaceId} />

        {/* Botão "Criar" — âncora visual do Jira, sempre acessível */}
        <div className={cx("px-3 pt-3", collapsed && "px-2")}>
          <button
            onClick={() => navigate(space.home)}
            title="Criar"
            className={cx(
              "flex items-center gap-2 rounded-full bg-brand-600 font-semibold text-white shadow-sm transition-colors hover:bg-brand-700",
              collapsed ? "size-9 justify-center p-0" : "w-full px-4 py-2 text-sm",
            )}
          >
            <Plus className="size-4 shrink-0" strokeWidth={2.4} />
            {!collapsed && "Criar"}
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4 scrollbar-slim">
          <NavGroupBlock group={COMMON_GROUP} collapsed={collapsed} />

          {/* Troca de space "vira a página": o bloco antigo sai para a esquerda
              e o novo entra da direita. mode="wait" evita sobreposição. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={spaceId}
              initial={reduce ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -12 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="flex flex-col gap-5"
            >
              {space.groups.map((group) => (
                <NavGroupBlock key={group.heading} group={group} collapsed={collapsed} />
              ))}
            </motion.div>
          </AnimatePresence>
        </nav>

        {/* Footer de usuário */}
        <div className="border-t border-paper-100 dark:border-ink-800 p-3">
          <div className={cx("flex items-center gap-3 rounded-xl px-2 py-2", collapsed && "justify-center px-0")}>
            <Avatar initials={initials(user?.full_name)} status={status} />
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-medium text-ink dark:text-paper">
                    {user?.full_name ?? "Usuário"}
                  </p>
                  <p className="truncate text-xs text-paper-500">{user?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  title="Sair"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-paper-400 transition-colors hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper"
                >
                  <LogOut className="size-[17px]" strokeWidth={1.9} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Toggle de colapso — pinado na borda, como o do Jira */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="absolute -right-3 top-16 hidden size-6 place-items-center rounded-full border border-paper-200 bg-paper text-paper-400 shadow-sm transition-colors hover:text-ink dark:border-ink-700 dark:bg-ink-800 dark:hover:text-paper md:grid"
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </button>
      </motion.aside>

      {/* ---------------- Coluna principal ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-paper-200 dark:border-ink-800 bg-paper/80 dark:bg-ink-900/80 px-3 backdrop-blur-xl sm:gap-4 sm:px-6 [padding-top:env(safe-area-inset-top)]">
          {/* Hambúrguer — só mobile */}
          <button
            onClick={() => setMobileNav(true)}
            aria-label="Abrir menu"
            className="grid size-11 shrink-0 place-items-center rounded-lg text-paper-500 transition-colors hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper md:hidden"
          >
            <Menu className="size-5" strokeWidth={1.9} />
          </button>

          {/* Busca completa (>= sm) */}
          <button className="group hidden h-10 max-w-md flex-1 items-center gap-2.5 rounded-xl border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-800 px-3.5 text-left text-sm text-paper-400 transition-colors hover:border-paper-300 dark:hover:border-ink-600 hover:bg-paper-100 dark:hover:bg-ink-700 focus-ring sm:flex">
            <Search className="size-4 shrink-0" strokeWidth={1.9} />
            <span className="flex-1 truncate">Buscar cards, projetos, pessoas…</span>
            <Kbd>⌘K</Kbd>
          </button>
          {/* Busca compacta (mobile) */}
          <button
            aria-label="Buscar"
            className="grid size-11 shrink-0 place-items-center rounded-lg text-paper-500 transition-colors hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper sm:hidden"
          >
            <Search className="size-5" strokeWidth={1.9} />
          </button>

          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            <button
              onClick={cycleStatus}
              title="Clique para mudar seu status"
              className="flex items-center gap-2 rounded-full border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 px-2.5 py-1.5 text-xs font-medium text-ink dark:text-paper transition-colors hover:bg-paper-100 dark:hover:bg-ink-700 focus-ring sm:px-3"
            >
              <StatusDot status={status} />
              <span className="hidden sm:inline">{PRESENCE_LABEL[status]}</span>
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
            <IconButton
              title="Agenda"
              onClick={() => setAgendaOpen((v) => !v)}
              className={agendaOpen ? "border-brand-500 text-brand-600 dark:text-brand-400" : undefined}
            >
              <CalendarClock className="size-[18px]" strokeWidth={1.9} />
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
          className={cx(
            "flex-1 overflow-y-auto scrollbar-slim dark:bg-ink-950",
            location.pathname.startsWith("/app/poker") ? "p-0" : "px-4 py-5 sm:px-6 sm:py-7",
          )}
        >
          <div
            className={cx(
              "w-full",
              location.pathname.startsWith("/app/poker") && "h-full",
            )}
          >
            <Outlet />
          </div>
        </motion.main>
      </div>

      <CopilotChatWidget />
      <AgendaPanel open={agendaOpen} onClose={() => setAgendaOpen(false)} />
    </div>
  )
}

// Um grupo da sidebar: rótulo + itens (+ submenu de projetos, quando o grupo
// declara `projects`).
function NavGroupBlock({ group, collapsed }: { group: NavGroup; collapsed: boolean }) {
  return (
    <div>
      {!collapsed && (
        <div className="px-3 pb-1.5">
          <SectionLabel>{group.heading}</SectionLabel>
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {group.projects && <ProjectsNavLink collapsed={collapsed} kind={group.projects} />}
        {group.items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cx(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors max-md:min-h-11",
                collapsed && "justify-center px-0 py-2.5",
                isActive
                  ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                  : "text-ink-600 hover:bg-paper-100 dark:text-paper-400 dark:hover:bg-ink-800",
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* indicador de acento na borda esquerda */}
                <span
                  className={cx(
                    "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-600 transition-opacity",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                />
                <item.icon
                  className={cx(
                    "size-[18px] shrink-0 transition-colors",
                    isActive
                      ? "text-brand-600 dark:text-brand-300"
                      : "text-paper-400 group-hover:text-ink dark:group-hover:text-paper",
                  )}
                  strokeWidth={1.9}
                />
                {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

// Seletor de space — logo abaixo do workspace. Escolher aqui troca a sidebar
// inteira e navega para a home do space. Colapsado, vira uma coluna de ícones
// com a pílula ativa deslizando via layoutId.
function SpaceSwitcher({ collapsed, spaceId }: { collapsed: boolean; spaceId: SpaceId }) {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const setActiveSpace = useSpaceStore((s) => s.setActiveSpace)
  const [open, setOpen] = useState(false)
  const active = getSpace(spaceId)

  const go = (id: SpaceId) => {
    setActiveSpace(id)
    setOpen(false)
    navigate(getSpace(id).home)
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 border-b border-paper-100 px-2 py-2 dark:border-ink-800">
        {SPACES.map((s) => {
          const isActive = s.id === spaceId
          return (
            <button
              key={s.id}
              onClick={() => go(s.id)}
              title={`${s.label} — ${s.tagline}`}
              aria-current={isActive ? "page" : undefined}
              className={cx(
                "relative grid size-9 place-items-center rounded-lg transition-colors focus-ring",
                isActive
                  ? "text-brand-700 dark:text-brand-300"
                  : "text-paper-400 hover:bg-paper-100 hover:text-ink dark:hover:bg-ink-800 dark:hover:text-paper",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="space-pill"
                  transition={reduce ? { duration: 0 } : springSnappy}
                  className="absolute inset-0 -z-10 rounded-lg bg-brand-50 dark:bg-brand-500/10"
                />
              )}
              <s.icon className="size-[18px]" strokeWidth={1.9} />
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="relative border-b border-paper-100 px-3 py-2 dark:border-ink-800">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-paper-100 focus-ring dark:hover:bg-ink-800"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          <active.icon className="size-[15px]" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-paper-400">
            Space
          </span>
          <span className="block truncate text-sm font-medium text-ink dark:text-paper">
            {active.label}
          </span>
        </span>
        <ChevronDown
          className={cx(
            "size-4 shrink-0 text-paper-400 transition-transform duration-200",
            open && "rotate-180",
          )}
          strokeWidth={1.9}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              role="listbox"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="absolute left-3 right-3 top-[60px] z-20 origin-top rounded-xl border border-paper-200 bg-paper p-1.5 shadow-pop dark:border-ink-700 dark:bg-ink-800"
            >
              {SPACES.map((s) => {
                const isActive = s.id === spaceId
                return (
                  <button
                    key={s.id}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => go(s.id)}
                    className={cx(
                      "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      isActive
                        ? "bg-brand-50 dark:bg-brand-500/10"
                        : "hover:bg-paper-100 dark:hover:bg-white/5",
                    )}
                  >
                    <span
                      className={cx(
                        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md",
                        isActive
                          ? "bg-brand-500/15 text-brand-700 dark:text-brand-300"
                          : "bg-paper-100 text-paper-500 dark:bg-white/5",
                      )}
                    >
                      <s.icon className="size-3.5" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cx(
                          "block truncate text-sm",
                          isActive
                            ? "font-medium text-brand-700 dark:text-brand-300"
                            : "text-ink dark:text-paper-200",
                        )}
                      >
                        {s.label}
                      </span>
                      <span className="block text-[11px] leading-snug text-paper-500">
                        {s.tagline}
                      </span>
                    </span>
                    {isActive && (
                      <Check
                        className="mt-1 size-4 shrink-0 text-brand-600 dark:text-brand-300"
                        strokeWidth={2.2}
                      />
                    )}
                  </button>
                )
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// Item de projetos com submenu — como a lista de projetos do Jira embaixo do
// item "Projects". Filtra por tipo de projeto: software (Boards) x marketing
// (Campanhas), dando a cada tipo seu próprio menu.
function ProjectsNavLink({
  collapsed,
  kind,
}: {
  collapsed: boolean
  kind: "software" | "marketing"
}) {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { activeWorkspaceId } = useWorkspaces()
  const { data: allProjects } = useProjects(activeWorkspaceId)

  const isMarketing = kind === "marketing"
  const label = isMarketing ? "Campanhas" : "Boards"
  const Icon = isMarketing ? Megaphone : SquareKanban
  // Projeto de marketing = qualquer template diferente de "software".
  const projects = (allProjects ?? []).filter((p) =>
    isMarketing ? !!p.template && p.template !== "software" : !p.template || p.template === "software",
  )

  const activeProjectId = location.pathname.startsWith("/app/boards")
    ? searchParams.get("project")
    : null
  // Item ativo quando o projeto selecionado pertence a este grupo.
  const groupActive = !!activeProjectId && projects.some((p) => p.id === activeProjectId)
  const [open, setOpen] = useState(true)

  if (collapsed) {
    return (
      <NavLink
        to={isMarketing ? "/app/boards?type=marketing" : "/app/boards"}
        title={label}
        className={cx(
          "group relative flex items-center justify-center rounded-lg px-0 py-2.5 text-sm transition-colors",
          groupActive
            ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
            : "text-ink-600 hover:bg-paper-100 dark:text-paper-400 dark:hover:bg-ink-800",
        )}
      >
        <Icon className="size-[18px] shrink-0" strokeWidth={1.9} />
      </NavLink>
    )
  }

  return (
    <div>
      <div
        className={cx(
          "group relative flex items-center gap-1 rounded-lg pr-1.5 text-sm transition-colors",
          groupActive
            ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
            : "text-ink-600 hover:bg-paper-100 dark:text-paper-400 dark:hover:bg-ink-800",
        )}
      >
        <span
          className={cx(
            "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-600 transition-opacity",
            groupActive ? "opacity-100" : "opacity-0",
          )}
        />
        <NavLink
          to={isMarketing ? "/app/boards?type=marketing" : "/app/boards"}
          className="flex flex-1 items-center gap-3 px-3 py-2"
        >
          <Icon
            className={cx(
              "size-[18px] shrink-0 transition-colors",
              groupActive ? "text-brand-600 dark:text-brand-300" : "text-paper-400 group-hover:text-ink dark:group-hover:text-paper",
            )}
            strokeWidth={1.9}
          />
          <span className="flex-1 truncate text-left">{label}</span>
        </NavLink>
        {projects.length > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            title={open ? "Recolher projetos" : "Mostrar projetos"}
            className="grid size-6 shrink-0 place-items-center rounded-md text-paper-400 hover:bg-paper-200 dark:hover:bg-ink-700"
          >
            <ChevronDown className={cx("size-3.5 transition-transform", open ? "rotate-0" : "-rotate-90")} />
          </button>
        )}
      </div>

      {open && projects.length > 0 && (
        <div className="ml-[27px] flex flex-col gap-0.5 border-l border-paper-100 pl-2 dark:border-ink-700">
          {projects.map((p) => (
            <NavLink
              key={p.id}
              to={`/app/boards?project=${p.id}${isMarketing ? "&type=marketing" : ""}`}
              className={cx(
                "flex items-center gap-2 truncate rounded-lg px-2 py-1.5 text-[13px] transition-colors",
                p.id === activeProjectId
                  ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                  : "text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper",
              )}
            >
              <span className="grid size-[18px] shrink-0 place-items-center rounded bg-brand-500/15 text-[9px] font-bold text-brand-700 dark:text-brand-300">
                {p.key.slice(0, 2).toUpperCase()}
              </span>
              <span className="truncate">{p.name}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

// Seletor de workspace no topo da sidebar — mostra o ativo e permite trocar.
// Estilo "site picker" do Jira: fundo claro, avatar quadrado, chevron duplo.
function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { data: workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaces()
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const active = workspaces?.find((w) => w.id === activeWorkspaceId) ?? workspaces?.[0]
  const tile = (active?.name ?? "Pulse").trim().charAt(0).toUpperCase()

  return (
    <div className="relative border-b border-paper-100 dark:border-ink-800 p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-paper-100 dark:hover:bg-ink-800 focus-ring",
          collapsed && "justify-center px-0",
        )}
      >
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white shadow-brand-glow">
          {tile}
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-ink dark:text-paper">
                {active?.name ?? "Pulse"}
              </p>
              <p className="truncate text-[11px] tracking-[0.16em] text-paper-400">
                T4E GROUP
              </p>
            </div>
            <ChevronsUpDown className="size-4 shrink-0 text-paper-400" strokeWidth={1.9} />
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-3 right-3 top-[64px] z-20 animate-scale-in rounded-xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 p-1.5 shadow-pop">
            <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-paper-400">
              Seus workspaces
            </p>
            {(workspaces ?? []).map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  setActiveWorkspace(w.id)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink dark:text-paper-200 transition-colors hover:bg-paper-100 dark:hover:bg-white/5"
              >
                <div className="grid size-6 place-items-center rounded-md bg-brand-500/10 text-[11px] font-semibold text-brand-700 dark:bg-white/10 dark:text-paper">
                  {w.name.trim().charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 truncate">{w.name}</span>
                {w.id === activeWorkspaceId && (
                  <Check className="size-4 text-brand-600 dark:text-brand-300" strokeWidth={2.2} />
                )}
              </button>
            ))}
            <div className="my-1 h-px bg-paper-100 dark:bg-white/5" />
            <button
              onClick={() => {
                setOpen(false)
                setCreateOpen(true)
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-paper-500 transition-colors hover:bg-paper-100 dark:hover:bg-white/5 hover:text-ink dark:hover:text-paper-200"
            >
              <div className="grid size-6 place-items-center rounded-md border border-dashed border-paper-300 dark:border-white/20">
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
