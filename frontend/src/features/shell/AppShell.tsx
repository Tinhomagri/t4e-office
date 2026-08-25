import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  Menu,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronsUpDown,
  History,
  Keyboard,
  LifeBuoy,
  LogOut,
  Moon,
  Megaphone,
  Plus,
  Search,
  Settings,
  Spade,
  SquareKanban,
  Star,
  Sun,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useThemeStore } from "@/shared/theme.store"
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom"

import { useAuthStore } from "@/features/auth/auth.store"
import { ChatHeadsWidget } from "@/features/boards/ChatHeadsWidget"
import { CopilotChatWidget } from "@/features/copilot/CopilotChatWidget"
import { NotificationBell } from "@/features/boards/NotificationBell"
import { AgendaPanel } from "@/features/integrations/AgendaPanel"
import { MeetingCallOverlay } from "@/features/meetings/MeetingsPage"
import { useCreateWorkspace, useMembers, useProjects, useWorkspaces } from "@/features/workspace/workspace.hooks"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { useMyRole, useMySpaceIds } from "./spaceAccess"
import {
  Avatar,
  Button,
  Field,
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
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarPrefs,
} from "./sidebar.prefs.store"
import {
  COMMON_GROUP,
  DEFAULT_SPACE,
  type NavGroup,
  type NavItem,
  SPACES,
  type SpaceId,
  findNavItem,
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

  // Spaces que este membro pode ver neste workspace (só o dono os declara
  // para admin e membro). Vazio enquanto a membership ainda não carregou.
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const membersQuery = useMembers(activeWorkspaceId)
  const mySpaceIds = useMySpaceIds(activeWorkspaceId)
  const visibleSpaces = useMemo(
    () => SPACES.filter((s) => mySpaceIds.includes(s.id)),
    [mySpaceIds],
  )

  // "Copiloto" (relatório de uso/config de IA) só é útil pra quem pode
  // efetivamente vê-lo — a API já recusa membro comum, então o item some do
  // menu em vez de levar a uma tela de "acesso negado".
  const myRole = useMyRole(activeWorkspaceId)
  const isWorkspaceAdmin = myRole === "owner" || myRole === "admin"
  const commonGroup = useMemo(
    () =>
      isWorkspaceAdmin
        ? COMMON_GROUP
        : { ...COMMON_GROUP, items: COMMON_GROUP.items.filter((i) => i.label !== "Copiloto") },
    [isWorkspaceAdmin],
  )

  // Trava contra link direto/bookmark/URL velha para um space que o membro
  // não vê mais. Espera a membership carregar; depois, inclusive uma lista
  // vazia é acesso vazio de verdade e volta para Meu Dia, que mostra o aviso.
  useEffect(() => {
    if (!routeSpace) return
    if (membersQuery.isLoading) return
    if (mySpaceIds.includes(routeSpace)) return
    const fallback = mySpaceIds.includes(DEFAULT_SPACE)
      ? getSpace(DEFAULT_SPACE)
      : visibleSpaces[0]
    navigate(fallback?.home ?? "/app", { replace: true })
  }, [routeSpace, membersQuery.isLoading, mySpaceIds, visibleSpaces, navigate])

  const isDesktop = useMediaQuery("(min-width: 768px)")
  // No mobile a sidebar vira drawer full-width → nunca "colapsada".
  const collapsed = isDesktop ? collapsedRaw : false

  const width = useSidebarPrefs((s) => s.width)
  const pushRecent = useSidebarPrefs((s) => s.pushRecent)

  // Alimenta "Recentes" a cada navegação. Só rotas que correspondem a um item
  // do menu entram: uma tela de detalhe (drawer, modal) não é destino de menu,
  // e listá-la faria o bloco virar histórico do navegador.
  useEffect(() => {
    const item = findNavItem(location.pathname)
    if (item) pushRecent({ to: item.to, label: item.label })
  }, [location.pathname, pushRecent])

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

  const isPoker = location.pathname.startsWith("/app/poker")
  const isFullBleed = isPoker || location.pathname.startsWith("/app/comercial/atendimento")

  return (
    // Estrutura do Jira: a top bar atravessa a tela inteira e a sidebar começa
    // ABAIXO dela. Antes a sidebar subia até o topo e o header só cobria o
    // conteúdo — é o que fazia os dois blocos parecerem apps diferentes.
    // h-full/w-full (não h-screen/w-screen): o shell preenche o CONTEINER.
    // Na rota normal o contêiner é o #root, que já ocupa a viewport inteira —
    // mesmo resultado de antes. Dentro da janela do PC do escritório, o
    // contêiner é a janela, e é isso que permite rodar o sistema inteiro lá
    // dentro sem o shell vazar para fora da moldura.
    <div className="flex h-full w-full flex-col overflow-hidden bg-canvas text-ink dark:bg-ink-950 dark:text-paper">
      {/* ---------------- Top bar global ---------------- */}
      {/* h-12 = 48px, a altura real do top-nav do Jira (medida em docs/jira-ui-spec.md). */}
      <header className="relative z-50 flex h-12 shrink-0 items-center gap-1 border-b border-paper-200 bg-paper px-2 dark:border-ink-800 dark:bg-ink-900 sm:gap-2 sm:px-3 [padding-top:env(safe-area-inset-top)]">
        {/* Hambúrguer (mobile) / recolher sidebar (desktop) — no Jira o controle
            do menu mora no topo, não pendurado na borda da sidebar. */}
        <button
          onClick={() => (isDesktop ? setCollapsed((v) => !v) : setMobileNav(true))}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className="grid size-9 shrink-0 place-items-center rounded text-paper-500 transition-colors duration-150 hover:bg-paper-100 hover:text-ink focus-ring dark:hover:bg-ink-800 dark:hover:text-paper"
        >
          <Menu className="size-[18px]" strokeWidth={1.9} />
        </button>

        <button
          onClick={() => navigate("/app")}
          className="flex shrink-0 items-center gap-2 rounded px-1.5 py-1 transition-colors duration-150 hover:bg-paper-100 focus-ring dark:hover:bg-ink-800"
        >
          <span className="grid size-6 place-items-center rounded bg-brand-500 text-[11px] font-bold text-white">
            T4
          </span>
          <span className="hidden text-[15px] font-semibold tracking-[-0.01em] text-ink dark:text-paper sm:inline">
            Office
          </span>
        </button>

        {/* Busca central, como no Jira: não encostada na esquerda nem na direita. */}
        <div className="mx-1 flex min-w-0 flex-1 justify-center sm:mx-3">
          <button className="hidden h-8 w-full max-w-[560px] items-center gap-2 rounded border border-paper-200 bg-paper px-2.5 text-left text-[13px] text-paper-500 transition-colors duration-150 hover:bg-paper-50 focus-ring dark:border-ink-700 dark:bg-ink-800 dark:hover:bg-ink-700 sm:flex">
            <Search className="size-4 shrink-0" strokeWidth={1.9} />
            <span className="flex-1 truncate">Buscar</span>
            <Kbd>⌘K</Kbd>
          </button>
          <button
            aria-label="Buscar"
            className="grid size-9 shrink-0 place-items-center rounded text-paper-500 transition-colors duration-150 hover:bg-paper-100 hover:text-ink dark:hover:bg-ink-800 dark:hover:text-paper sm:hidden"
          >
            <Search className="size-5" strokeWidth={1.9} />
          </button>
        </div>

        {/* Criar mora na top bar (Jira 2024+), não na sidebar: é ação global,
            não navegação. Dropdown com os atalhos de criação mais usados. */}
        <CreateMenu navigate={navigate} location={location} />

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={cycleStatus}
            title="Clique para mudar seu status"
            className="ml-1 hidden h-8 items-center gap-1.5 rounded px-2 text-[12px] font-medium text-paper-600 transition-colors duration-150 hover:bg-paper-100 focus-ring dark:text-paper-400 dark:hover:bg-ink-800 lg:flex"
          >
            <StatusDot status={status} />
            {PRESENCE_LABEL[status]}
          </button>

          <TopIcon
            label={theme === "dark" ? "Modo claro" : "Modo escuro"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              <Sun className="size-[18px]" strokeWidth={1.9} />
            ) : (
              <Moon className="size-[18px]" strokeWidth={1.9} />
            )}
          </TopIcon>
          <NotificationBell />
          <TopIcon
            label="Agenda"
            active={agendaOpen}
            onClick={() => setAgendaOpen((v) => !v)}
          >
            <CalendarClock className="size-[18px]" strokeWidth={1.9} />
          </TopIcon>
          <TopIcon label="Configurações" onClick={() => navigate("/app/perfil")}>
            <Settings className="size-[18px]" strokeWidth={1.9} />
          </TopIcon>

          <UserMenu
            name={user?.full_name}
            email={user?.email}
            avatarUrl={user?.avatar_url}
            status={status}
            onLogout={handleLogout}
          />
        </div>
      </header>

      {/* ---------------- Sidebar + conteúdo ---------------- */}
      <div className="relative flex min-h-0 flex-1">
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
              className="fixed inset-0 top-14 z-40 bg-ink-950/50 md:hidden"
            />
          )}
        </AnimatePresence>

        <motion.aside
          animate={{ width: collapsed ? 60 : width }}
          transition={reduce ? { duration: 0 } : { duration: 0.2, ease: EASE }}
          className={cx(
            // Sidebar levemente tingida contra conteúdo branco — é o contraste
            // que dá a leitura de "navegação x trabalho" no Jira.
            "z-40 flex shrink-0 flex-col border-r border-paper-200 bg-canvas dark:border-ink-800 dark:bg-ink-900",
            // md:relative (não static) porque a alça de resize se posiciona
            // absoluta contra a sidebar. Os insets do drawer mobile PRECISAM
            // ser zerados no md: em `relative` eles viram deslocamento, e o
            // `top-14` empurrava a sidebar inteira 56px para baixo.
            "fixed inset-y-0 top-14 left-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] [padding-bottom:env(safe-area-inset-bottom)] md:relative md:inset-y-auto md:top-auto md:translate-x-0 md:!transition-none",
            mobileNav ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0",
          )}
        >
          <WorkspaceSwitcher collapsed={collapsed} />
          <SpaceSwitcher collapsed={collapsed} spaceId={spaceId} spaces={visibleSpaces} />

          <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3 scrollbar-slim">
            {/* Favoritos primeiro: o que o usuário fixou vale mais que a ordem
                que nós escolhemos para ele. */}
            <FavoritesBlock collapsed={collapsed} />

            {/* "Para você" primeiro: Meu Dia é a rota raiz (/app) e o índice
                do MyDayPage — precisa ser o primeiro item pra bater com o que
                a pessoa vê ao entrar. Os grupos do space vêm depois. */}
            <NavGroupBlock group={commonGroup} collapsed={collapsed} />

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={spaceId}
                initial={reduce ? false : { opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: -10 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="flex flex-col gap-4"
              >
                {space.groups.map((group) => (
                  <NavGroupBlock key={group.heading} group={group} collapsed={collapsed} />
                ))}
              </motion.div>
            </AnimatePresence>

            <RecentsBlock collapsed={collapsed} />
          </nav>

          <SidebarFooter collapsed={collapsed} />

          {/* Alça de arraste na borda — largura é preferência de quem usa, não
              constante de design. Só no desktop expandido. */}
          {isDesktop && !collapsed && <ResizeHandle />}
        </motion.aside>

        {/* Conteúdo rolável — branco, para a sidebar tingida se destacar. */}
        <motion.main
          key={location.pathname}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: EASE }}
          className={cx(
            "flex min-w-0 flex-1 flex-col bg-paper scrollbar-slim dark:bg-ink-950",
            // Full-bleed (inbox, poker) gerencia a própria rolagem por dentro.
            // Deixar `overflow-y-auto` aqui fazia a tela inteira crescer e a
            // última linha da lista ficar cortada abaixo da viewport.
            isFullBleed
              ? "overflow-hidden p-0"
              : "overflow-y-auto px-4 py-5 sm:px-6 sm:py-6",
          )}
        >
          <div className={cx("w-full", isFullBleed && "flex min-h-0 flex-1 flex-col")}>
            <Outlet />
          </div>
        </motion.main>
      </div>

      <CopilotChatWidget />
      <ChatHeadsWidget />
      <AgendaPanel open={agendaOpen} onClose={() => setAgendaOpen(false)} />
      <MeetingCallOverlay />
    </div>
  )
}

// Ícone da top bar. Quadrado de 32px, sem moldura — a borda só apareceria para
// separar itens que já estão separados por espaço.
// Dropdown do botão "Criar" na top bar — atalhos pros fluxos de criação mais
// usados, sem obrigar a pessoa a navegar até o space certo primeiro.
function CreateMenu({
  navigate,
  location,
}: {
  navigate: ReturnType<typeof useNavigate>
  location: ReturnType<typeof useLocation>
}) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()

  const goTo = (to: string, event?: string) => {
    setOpen(false)
    navigate(to)
    if (event) requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(event)))
  }

  const items = [
    {
      label: "Card",
      icon: SquareKanban,
      onClick: () =>
        location.pathname.startsWith("/app/boards")
          ? (setOpen(false), window.dispatchEvent(new CustomEvent("app:create-card")))
          : goTo("/app/boards", "app:create-card"),
    },
    { label: "Planning Poker", icon: Spade, onClick: () => goTo("/app/poker") },
    { label: "Reunião", icon: CalendarClock, onClick: () => goTo("/app/integrations") },
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-8 shrink-0 items-center gap-1.5 rounded bg-brand-500 px-3 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-brand-600 active:bg-brand-600 focus-ring"
      >
        <Plus className="size-4" strokeWidth={2.4} />
        <span className="hidden sm:inline">Criar</span>
        <ChevronDown className="size-3.5" strokeWidth={2.4} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              role="menu"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.16, ease: EASE }}
              className="absolute left-0 top-9 z-20 w-52 origin-top-left rounded-lg border border-paper-200 bg-paper p-1.5 shadow-pop dark:border-ink-700 dark:bg-ink-800"
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  role="menuitem"
                  onClick={item.onClick}
                  className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-[13px] text-ink transition-colors duration-150 hover:bg-paper-100 dark:text-paper-200 dark:hover:bg-white/5"
                >
                  <item.icon className="size-4 text-paper-500" strokeWidth={1.9} />
                  {item.label}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function TopIcon({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "relative grid size-8 place-items-center rounded transition-colors duration-150 focus-ring",
        active
          ? "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-300"
          : "text-paper-500 hover:bg-paper-100 hover:text-ink dark:text-paper-400 dark:hover:bg-ink-800 dark:hover:text-paper",
      )}
    >
      {children}
    </button>
  )
}

// Avatar + menu de conta no canto superior direito — onde o Jira coloca o
// perfil. Sai do rodapé da sidebar, que era espaço de navegação gasto com conta.
function UserMenu({
  name,
  email,
  avatarUrl,
  status,
  onLogout,
}: {
  name?: string
  email?: string
  avatarUrl?: string | null
  status: PresenceStatus
  onLogout: () => void
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()

  return (
    <div className="relative ml-1">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Conta"
        className="grid place-items-center rounded-full focus-ring"
      >
        {avatarUrl ? <img src={avatarUrl} alt="Foto de perfil" className="size-8 rounded-full object-cover ring-2 ring-paper dark:ring-ink-700" /> : <Avatar initials={initials(name)} status={status} />}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              role="menu"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.16, ease: EASE }}
              className="absolute right-0 top-11 z-20 w-64 origin-top-right rounded-lg border border-paper-200 bg-paper p-1.5 shadow-pop dark:border-ink-700 dark:bg-ink-800"
            >
              <div className="px-2.5 py-2">
                <div className="flex items-center gap-2"><span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-500/20 text-xs font-semibold text-brand-600">{avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : initials(name)}</span><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-ink dark:text-paper">{name ?? "Usuário"}</p>
                <p className="truncate text-[12px] text-paper-500">{email}</p>
                </div></div>
              </div>
              <div className="my-1 h-px bg-paper-100 dark:bg-white/5" />
              <button role="menuitem" onClick={() => { setOpen(false); navigate("/app/perfil") }} className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-[13px] text-ink hover:bg-paper-100 dark:text-paper-200 dark:hover:bg-white/5"><Settings className="size-4 text-paper-500" /> Perfil e configurações</button>
              <button
                role="menuitem"
                onClick={onLogout}
                className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-[13px] text-ink transition-colors duration-150 hover:bg-paper-100 dark:text-paper-200 dark:hover:bg-white/5"
              >
                <LogOut className="size-4 text-paper-500" strokeWidth={1.9} />
                Sair
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// Uma linha de navegação. A estrela mora FORA do NavLink (um <button> dentro de
// um <a> é HTML inválido e o clique da estrela navegaria junto).
function NavRow({
  item,
  collapsed,
  /** Favoritar só faz sentido no menu de origem — no bloco Favoritos ela vira "desafixar". */
  starrable = true,
}: {
  item: NavItem
  collapsed: boolean
  starrable?: boolean
}) {
  const favorites = useSidebarPrefs((s) => s.favorites)
  const toggleFavorite = useSidebarPrefs((s) => s.toggleFavorite)
  const isFav = favorites.includes(item.to)

  return (
    <div className="group/row relative flex items-center">
      <NavLink
        to={item.to}
        end={item.end}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          cx(
            // Linha de 32px, raio pequeno, texto 14px: a métrica do Jira.
            "flex min-w-0 flex-1 items-center gap-3 rounded px-2.5 py-1.5 text-sm transition-colors duration-150 max-md:min-h-11",
            collapsed && "justify-center px-0",
            // Ativo = pílula azul-clara preenchida com texto brand. É a
            // assinatura do menu do Jira — sem trilho lateral.
            isActive
              ? "bg-brand-50 font-semibold text-brand-500 dark:bg-brand-500/15 dark:text-brand-300"
              : "font-normal text-paper-600 hover:bg-paper-100 dark:text-paper-400 dark:hover:bg-ink-800 dark:hover:text-paper-200",
          )
        }
      >
        {({ isActive }) => (
          <>
            <item.icon
              className={cx(
                "size-4 shrink-0 transition-colors duration-150",
                isActive
                  ? "text-brand-500 dark:text-brand-300"
                  : "text-paper-500 group-hover/row:text-ink dark:text-paper-400 dark:group-hover/row:text-paper",
              )}
              strokeWidth={2}
            />
            {!collapsed && (
              <span className={cx("flex-1 truncate text-left", starrable && "pr-5")}>
                {item.label}
              </span>
            )}
          </>
        )}
      </NavLink>

      {/* Fixada fica sempre visível; as demais aparecem no hover/foco, para a
          coluna não virar um campo de estrelas cinzas. */}
      {starrable && !collapsed && (
        <button
          onClick={() => toggleFavorite(item.to)}
          title={isFav ? "Remover dos favoritos" : "Fixar nos favoritos"}
          aria-label={isFav ? `Remover ${item.label} dos favoritos` : `Fixar ${item.label} nos favoritos`}
          aria-pressed={isFav}
          className={cx(
            "absolute right-1.5 grid size-6 place-items-center rounded transition-all duration-150 focus-ring",
            "hover:bg-paper-200 dark:hover:bg-ink-700",
            isFav
              ? "text-amber-500 opacity-100"
              : "text-paper-400 opacity-0 hover:text-ink focus-visible:opacity-100 group-hover/row:opacity-100 dark:hover:text-paper",
          )}
        >
          <Star className="size-3.5" strokeWidth={2} fill={isFav ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  )
}

// Cabeçalho de grupo recolhível. Um clique some com o grupo inteiro — é como se
// tira da frente uma seção que não se usa hoje sem perder o resto do menu.
function GroupHeading({
  heading,
  collapsed: groupCollapsed,
  onToggle,
  count,
}: {
  heading: string
  collapsed: boolean
  onToggle: () => void
  count?: number
}) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={!groupCollapsed}
      className="group/head flex w-full items-center gap-1 rounded px-2.5 py-1 text-left transition-colors duration-150 hover:bg-paper-100 focus-ring dark:hover:bg-ink-800"
    >
      <ChevronDown
        className={cx(
          "size-3 shrink-0 text-paper-400 transition-transform duration-200",
          groupCollapsed && "-rotate-90",
        )}
        strokeWidth={2.4}
      />
      <SectionLabel>{heading}</SectionLabel>
      {count != null && count > 0 && (
        <span className="ml-auto text-[10px] font-semibold tabular text-paper-400">{count}</span>
      )}
    </button>
  )
}

// Um grupo da sidebar: rótulo recolhível + itens (+ submenu de projetos, quando
// o grupo declara `projects`).
function NavGroupBlock({ group, collapsed }: { group: NavGroup; collapsed: boolean }) {
  const collapsedGroups = useSidebarPrefs((s) => s.collapsedGroups)
  const toggleGroup = useSidebarPrefs((s) => s.toggleGroup)
  // Colapsada, a sidebar é uma trilha de ícones: recolher grupo ali esconderia
  // ícones sem deixar pista de como trazê-los de volta.
  const groupCollapsed = !collapsed && !!collapsedGroups[group.heading]

  return (
    <div>
      {!collapsed && (
        <GroupHeading
          heading={group.heading}
          collapsed={groupCollapsed}
          onToggle={() => toggleGroup(group.heading)}
          count={groupCollapsed ? group.items.length : undefined}
        />
      )}
      <AnimatePresence initial={false}>
        {!groupCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="flex flex-col overflow-hidden"
          >
            {group.projects && <ProjectsNavLink collapsed={collapsed} kind={group.projects} />}
            {group.items.map((item) => (
              <NavRow key={item.to} item={item} collapsed={collapsed} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Bloco de favoritos: o menu que o usuário monta para si. Some quando vazio —
// um "Favoritos (0)" permanente só ocuparia a dobra mais valiosa da coluna.
function FavoritesBlock({ collapsed }: { collapsed: boolean }) {
  const favorites = useSidebarPrefs((s) => s.favorites)
  const collapsedGroups = useSidebarPrefs((s) => s.collapsedGroups)
  const toggleGroup = useSidebarPrefs((s) => s.toggleGroup)

  // Rota fixada que não existe mais (item removido do menu) some sozinha.
  const items = favorites.map(findNavItem).filter((i): i is NavItem => Boolean(i))
  if (items.length === 0) return null

  const groupCollapsed = !collapsed && !!collapsedGroups.__favorites

  return (
    <div>
      {!collapsed && (
        <GroupHeading
          heading="Favoritos"
          collapsed={groupCollapsed}
          onToggle={() => toggleGroup("__favorites")}
          count={groupCollapsed ? items.length : undefined}
        />
      )}
      <AnimatePresence initial={false}>
        {!groupCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="flex flex-col overflow-hidden"
          >
            {items.map((item) => (
              <NavRow key={item.to} item={item} collapsed={collapsed} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Últimas telas visitadas. Fica no fim da coluna: é rede de segurança para
// voltar a algo, não o caminho principal.
function RecentsBlock({ collapsed }: { collapsed: boolean }) {
  const recents = useSidebarPrefs((s) => s.recents)
  const collapsedGroups = useSidebarPrefs((s) => s.collapsedGroups)
  const toggleGroup = useSidebarPrefs((s) => s.toggleGroup)

  // Na trilha de ícones não cabe — e repetiria ícones já visíveis acima.
  if (collapsed || recents.length === 0) return null

  const groupCollapsed = !!collapsedGroups.__recents

  return (
    // Sem `mt-auto`: empurrar o bloco para o fim da coluna abria um vão morto
    // entre ele e o menu. Recentes fecha a lista, coladinho no que veio antes.
    <div className="border-t border-paper-100 pt-2 dark:border-ink-800">
      <GroupHeading
        heading="Recentes"
        collapsed={groupCollapsed}
        onToggle={() => toggleGroup("__recents")}
        count={groupCollapsed ? recents.length : undefined}
      />
      <AnimatePresence initial={false}>
        {!groupCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="flex flex-col overflow-hidden"
          >
            {recents.map((r) => (
              <NavLink
                key={r.to}
                to={r.to}
                className={({ isActive }) =>
                  cx(
                    "flex items-center gap-3 rounded px-2.5 py-1.5 text-[13px] transition-colors duration-150",
                    isActive
                      ? "font-medium text-brand-500 dark:text-brand-300"
                      : "text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800 dark:hover:text-paper-200",
                  )
                }
              >
                <History className="size-3.5 shrink-0 text-paper-400" strokeWidth={2} />
                <span className="truncate">{r.label}</span>
              </NavLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Rodapé fixo da sidebar: ajuda e atalhos. Fora da área rolável, para não sumir
// quando o menu do space é longo.
function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const items = [
    { label: "Atalhos de teclado", icon: Keyboard },
    { label: "Ajuda & suporte", icon: LifeBuoy },
  ]

  return (
    <div
      className={cx(
        "shrink-0 border-t border-paper-200 px-2 py-2 dark:border-ink-800",
        collapsed && "px-1",
      )}
    >
      {items.map(({ label, icon: Icon }) => (
        <button
          key={label}
          title={label}
          aria-label={label}
          className={cx(
            "flex w-full items-center gap-3 rounded px-2.5 py-1.5 text-[13px] text-paper-500 transition-colors duration-150 hover:bg-paper-100 hover:text-ink focus-ring dark:hover:bg-ink-800 dark:hover:text-paper",
            collapsed && "justify-center px-0",
          )}
        >
          <Icon className="size-4 shrink-0" strokeWidth={1.9} />
          {!collapsed && <span className="truncate">{label}</span>}
        </button>
      ))}
    </div>
  )
}

// Borda arrastável. Usa Pointer Events (cobre mouse e trackpad) e captura o
// ponteiro para o arrasto não morrer se o cursor sair da alça.
function ResizeHandle() {
  const setWidth = useSidebarPrefs((s) => s.setWidth)
  const [dragging, setDragging] = useState(false)
  const asideLeft = useRef(0)

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // A sidebar começa na borda esquerda da viewport, mas medimos em vez de
    // assumir: evita quebrar se um dia houver algo à esquerda dela.
    const aside = e.currentTarget.parentElement
    asideLeft.current = aside?.getBoundingClientRect().left ?? 0
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return
      setWidth(e.clientX - asideLeft.current)
    },
    [dragging, setWidth],
  )

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
  }, [])

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar menu"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // Duplo clique devolve a largura padrão — saída para quem arrastou longe demais.
      onDoubleClick={() => setWidth(SIDEBAR_MIN_WIDTH + (SIDEBAR_MAX_WIDTH - SIDEBAR_MIN_WIDTH) / 2)}
      className={cx(
        "absolute inset-y-0 right-0 z-50 w-1 cursor-col-resize transition-colors duration-150",
        dragging ? "bg-brand-400" : "hover:bg-brand-300/60",
      )}
    />
  )
}

// Seletor de space — logo abaixo do workspace. Escolher aqui troca a sidebar
// inteira e navega para a home do space. Colapsado, vira uma coluna de ícones
// com a pílula ativa deslizando via layoutId.
function SpaceSwitcher({
  collapsed,
  spaceId,
  spaces,
}: {
  collapsed: boolean
  spaceId: SpaceId
  spaces: typeof SPACES
}) {
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
        {spaces.map((s) => {
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
    <div className="relative border-b border-paper-200 px-3 pb-2.5 dark:border-ink-800">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-paper-100 focus-ring dark:hover:bg-ink-800"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          <active.icon className="size-[15px]" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-paper-400">
            Space
          </span>
          <span className="block truncate text-[13px] font-semibold text-ink dark:text-paper">
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
              {spaces.map((s) => {
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

// Nº de projetos mostrados direto na sidebar antes de virar "Ver todos" — como
// o bloco "Recente" do Jira, que corta em poucos itens e manda o resto pro
// modal de espaços em vez de empurrar a lista inteira pro menu.
const INLINE_PROJECTS_LIMIT = 6

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
  const recentProjectIds = useSidebarPrefs((s) => s.recentProjectIds)
  // Projeto de marketing = qualquer template diferente de "software".
  const projects = useMemo(() => {
    const filtered = (allProjects ?? []).filter((p) =>
      isMarketing ? !!p.template && p.template !== "software" : !p.template || p.template === "software",
    )
    // Último aberto primeiro — sem isso a pessoa tinha que caçar o projeto
    // que acabou de sair na lista alfabética inteira. Quem nunca foi aberto
    // (não está no histórico) cai depois, na ordem alfabética de sempre.
    const rank = new Map(recentProjectIds.map((id, i) => [id, i]))
    return [...filtered].sort((a, b) => {
      const ra = rank.get(a.id) ?? Infinity
      const rb = rank.get(b.id) ?? Infinity
      if (ra !== rb) return ra - rb
      return a.name.localeCompare(b.name)
    })
  }, [allProjects, isMarketing, recentProjectIds])

  const onBoardsRoute = location.pathname.startsWith("/app/boards")
  const activeProjectId = onBoardsRoute ? searchParams.get("project") : null
  // Um projeto deste grupo está aberto.
  const childActive = !!activeProjectId && projects.some((p) => p.id === activeProjectId)
  // O próprio item é o destino: rota de boards deste tipo, sem projeto escolhido.
  const selfActive =
    onBoardsRoute &&
    !activeProjectId &&
    (searchParams.get("type") === "marketing") === isMarketing
  // Só o item realmente aberto ganha fundo. Pintar pai e filho ao mesmo tempo
  // dava duas seleções concorrentes na mesma coluna.
  const groupActive = selfActive || childActive
  // Aberto por padrão: só mostra INLINE_PROJECTS_LIMIT (6) de qualquer jeito,
  // então não empurra o resto do menu — recolher só escondia a lista que a
  // pessoa mais usa (agora ordenada por último aberto) e obrigava reabrir a
  // cada visita.
  const [open, setOpen] = useState(true)
  const [allOpen, setAllOpen] = useState(false)
  const visibleProjects = projects.slice(0, INLINE_PROJECTS_LIMIT)
  const hiddenCount = projects.length - visibleProjects.length

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
          // Fundo só quando o próprio item é o destino. Com um projeto filho
          // aberto o pai fica em texto de destaque, sem competir com ele.
          selfActive
            ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
            : childActive
              ? "font-medium text-brand-700 hover:bg-paper-100 dark:text-brand-300 dark:hover:bg-ink-800"
              : "text-ink-600 hover:bg-paper-100 dark:text-paper-400 dark:hover:bg-ink-800",
        )}
      >
        <span
          className={cx(
            "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-600 transition-opacity",
            selfActive ? "opacity-100" : "opacity-0",
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
          {visibleProjects.map((p) => (
            <ProjectRow key={p.id} project={p} active={p.id === activeProjectId} isMarketing={isMarketing} />
          ))}
          {hiddenCount > 0 && (
            <button
              onClick={() => setAllOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-paper-400 transition-colors hover:bg-paper-100 hover:text-ink dark:hover:bg-ink-800 dark:hover:text-paper"
            >
              <span className="grid size-[18px] shrink-0 place-items-center text-paper-400">···</span>
              <span>Ver todos ({projects.length})</span>
            </button>
          )}
        </div>
      )}

      <AllProjectsModal
        open={allOpen}
        onClose={() => setAllOpen(false)}
        projects={projects}
        isMarketing={isMarketing}
        activeProjectId={activeProjectId}
        label={label}
      />
    </div>
  )
}

// Linha de projeto — reaproveitada na lista inline (corte de
// INLINE_PROJECTS_LIMIT) e dentro do modal "Ver todos".
function ProjectRow({
  project: p,
  active,
  isMarketing,
  onNavigate,
}: {
  project: { id: string; name: string; key: string; avatar_url?: string | null; avatar_emoji?: string | null; avatar_color?: string | null }
  active: boolean
  isMarketing: boolean
  onNavigate?: () => void
}) {
  const touchProject = useSidebarPrefs((s) => s.touchProject)
  return (
    // Fundo de hover mora AQUI (na linha inteira), não no NavLink de dentro —
    // antes o NavLink só cobria parte da largura (sobrava espaço pra
    // engrenagem) e o hover "encolhia" em vez de preencher a linha toda.
    <div
      className={cx(
        "group/proj flex w-full items-center gap-0.5 rounded-lg text-[13px] transition-colors",
        active
          ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
          : "text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper",
      )}
    >
      <NavLink
        to={`/app/boards?project=${p.id}${isMarketing ? "&type=marketing" : ""}`}
        onClick={() => {
          touchProject(p.id)
          onNavigate?.()
        }}
        className="flex min-w-0 flex-1 items-center gap-2 truncate px-2 py-1.5"
      >
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" className="size-[18px] shrink-0 rounded object-cover" />
        ) : p.avatar_emoji ? (
          <span
            className="grid size-[18px] shrink-0 place-items-center rounded text-[11px] leading-none"
            style={{ backgroundColor: p.avatar_color || undefined }}
          >
            {p.avatar_emoji}
          </span>
        ) : (
          <span className="grid size-[18px] shrink-0 place-items-center rounded bg-brand-500/15 text-[9px] font-bold text-brand-700 dark:text-brand-300">
            {p.key.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="truncate">{p.name}</span>
      </NavLink>
      {/* Só no hover da linha — a lista de projetos não pode ficar poluída de
          botões quando ninguém está mexendo nela. */}
      <NavLink
        to={`/app/boards/${p.id}/settings`}
        onClick={onNavigate}
        title="Configurações do quadro"
        aria-label={`Configurações do quadro ${p.name}`}
        className="mr-1 grid size-6 shrink-0 place-items-center rounded-md opacity-0 transition-opacity hover:bg-paper-200 group-hover/proj:opacity-100 dark:hover:bg-ink-700"
      >
        <Settings className="size-3.5" />
      </NavLink>
    </div>
  )
}

// Modal "Ver todos" — igual ao "Mais espaços" do Jira: busca + lista completa,
// pra sidebar não precisar carregar dezenas de projetos abertos o tempo todo.
function AllProjectsModal({
  open,
  onClose,
  projects,
  isMarketing,
  activeProjectId,
  label,
}: {
  open: boolean
  onClose: () => void
  projects: Array<{ id: string; name: string; key: string; avatar_url?: string | null; avatar_emoji?: string | null; avatar_color?: string | null }>
  isMarketing: boolean
  activeProjectId: string | null
  label: string
}) {
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (open) setQuery("")
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q),
    )
  }, [projects, query])

  return (
    <Modal open={open} onClose={onClose} title={`Todos os ${label.toLowerCase()}`} size="lg">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-paper-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar projeto..."
          autoFocus
          className="pl-9"
        />
      </div>
      <div className="mt-3 flex max-h-[50vh] flex-col gap-0.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-paper-400">Nenhum projeto encontrado.</p>
        ) : (
          filtered.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              active={p.id === activeProjectId}
              isMarketing={isMarketing}
              onNavigate={onClose}
            />
          ))
        )}
      </div>
    </Modal>
  )
}

// Seletor de workspace no topo da sidebar — mostra o ativo e permite trocar.
// Estilo "site picker" do Jira: fundo claro, avatar quadrado, chevron duplo.
//
// Sem borda inferior de propósito: workspace e space são o MESMO bloco de
// contexto ("onde eu estou"). Dois filetes seguidos faziam parecer dois
// seletores concorrentes; a separação vem só depois do space.
function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { data: workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaces()
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const active = workspaces?.find((w) => w.id === activeWorkspaceId) ?? workspaces?.[0]
  const tile = (active?.name ?? "Pulse").trim().charAt(0).toUpperCase()

  return (
    <div className="relative px-3 pb-1 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-paper-100 focus-ring dark:hover:bg-ink-800",
          collapsed && "justify-center px-0",
        )}
      >
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-600 text-[13px] font-bold text-white">
          {tile}
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-ink dark:text-paper">
                {active?.name ?? "Pulse"}
              </p>
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-paper-400">
                T4E GROUP
              </p>
            </div>
            <ChevronsUpDown className="size-3.5 shrink-0 text-paper-400" strokeWidth={1.9} />
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          {/* Colapsado, o pai relativo tem só ~60px (a trilha de ícones) — um
              painel `left-3 right-3` nascia espremido nessa largura, com o
              texto quebrando letra a letra. Vira um flyout à direita da
              trilha, com largura própria, em vez de preencher o pai. */}
          <div
            className={cx(
              "absolute top-[64px] z-20 w-64 animate-scale-in rounded-xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 p-1.5 shadow-pop",
              collapsed ? "left-full ml-2" : "left-3 right-3 w-auto",
            )}
          >
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
