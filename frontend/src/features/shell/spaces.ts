// Spaces do workspace: cada um é um "modo de trabalho" com sua própria sidebar.
//
// Ao escolher o workspace, o usuário escolhe também em qual space está —
// Boards (nosso Jira), Marketing ou Comercial (CRM). A sidebar troca inteira:
// quem está no Comercial não vê fila de publicação, e vice-versa. Itens que
// valem para qualquer space (Meu Dia, Escritório, Copiloto) ficam em COMMON,
// sempre visíveis no topo.
import {
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  FileText,
  Gauge,
  LayoutDashboard,
  LineChart,
  ListChecks,
  ListTodo,
  type LucideIcon,
  Megaphone,
  Share2,
  Smile,
  Sparkles,
  Spade,
  SquareKanban,
  Target,
  Trophy,
  Upload,
  UserPlus,
  UserSearch,
  Users,
} from "lucide-react"

export type SpaceId = "boards" | "marketing" | "comercial"

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
}

export interface NavGroup {
  heading: string
  items: NavItem[]
  /** Injeta o submenu de projetos (lista vinda da API) neste grupo. */
  projects?: "software" | "marketing"
}

export interface Space {
  id: SpaceId
  label: string
  /** Uma linha no seletor — diz para quem o space é. */
  tagline: string
  icon: LucideIcon
  /** Rota de entrada ao trocar de space. */
  home: string
  /** Prefixos de rota que pertencem a este space (para derivar o ativo da URL). */
  match: string[]
  groups: NavGroup[]
}

/** Itens que existem em todos os spaces — contexto pessoal, não de área. */
export const COMMON_GROUP: NavGroup = {
  heading: "Para você",
  items: [
    { label: "Meu Dia", to: "/app", icon: LayoutDashboard, end: true },
    { label: "Escritório", to: "/app/office", icon: Users },
    { label: "Copiloto", to: "/app/copilot", icon: Sparkles },
  ],
}

export const SPACES: Space[] = [
  {
    id: "boards",
    label: "Boards",
    tagline: "Projetos, sprints e cards do time de produto",
    icon: SquareKanban,
    home: "/app/boards",
    match: [
      "/app/boards",
      "/app/poker",
      "/app/integrations",
      "/app/importar",
      "/app/reports",
      "/app/portfolio",
    ],
    groups: [
      {
        heading: "Projetos",
        projects: "software",
        items: [
          { label: "Planning Poker", to: "/app/poker", icon: Spade },
          { label: "Reuniões", to: "/app/integrations", icon: CalendarClock },
          { label: "Importar Jira/Trello", to: "/app/importar", icon: Upload },
        ],
      },
      {
        heading: "Analytics",
        items: [
          { label: "Relatórios", to: "/app/reports", icon: LineChart },
          { label: "Portfólio", to: "/app/portfolio", icon: Building2 },
        ],
      },
      {
        heading: "Pessoas",
        items: [
          { label: "Membros", to: "/app/members", icon: UserPlus },
          { label: "Avatar", to: "/app/avatar", icon: Smile },
        ],
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    tagline: "Campanhas, calendário editorial e redes sociais",
    icon: Megaphone,
    home: "/app/marketing",
    match: ["/app/marketing"],
    groups: [
      {
        heading: "Campanhas",
        projects: "marketing",
        items: [
          // Todo space abre num dashboard: Boards tem o Meu Dia, Comercial e
          // Marketing têm o seu deck.
          { label: "Dashboard", to: "/app/marketing", icon: Gauge, end: true },
          { label: "Calendário editorial", to: "/app/marketing/calendario", icon: CalendarDays },
          { label: "Fila de publicação", to: "/app/marketing/fila", icon: ListChecks },
        ],
      },
      {
        heading: "Performance",
        items: [
          { label: "Analytics social", to: "/app/marketing/analytics", icon: BarChart3 },
          { label: "Redes sociais", to: "/app/marketing/redes", icon: Share2 },
        ],
      },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    tagline: "CRM completo: leads, funil, clientes e propostas",
    icon: Target,
    home: "/app/comercial",
    match: ["/app/comercial"],
    groups: [
      {
        heading: "Funil",
        items: [
          // O Dashboard É a raiz do space — não existe mais uma "Visão geral"
          // concorrendo com ele. O painel de atrasados que só existia lá foi
          // absorvido pelo deck.
          { label: "Dashboard", to: "/app/comercial", icon: Gauge, end: true },
          { label: "Leads", to: "/app/comercial/leads", icon: UserSearch },
          { label: "Pipeline", to: "/app/comercial/pipeline", icon: Target },
        ],
      },
      {
        heading: "Carteira",
        items: [
          { label: "Clientes", to: "/app/comercial/clientes", icon: Building2 },
          { label: "Atividades", to: "/app/comercial/atividades", icon: ListTodo },
          { label: "Propostas", to: "/app/comercial/propostas", icon: FileText },
        ],
      },
      {
        heading: "Resultado",
        items: [
          { label: "Metas & forecast", to: "/app/comercial/metas", icon: Trophy },
          { label: "Time comercial", to: "/app/members", icon: UserPlus },
        ],
      },
    ],
  },
]

export const DEFAULT_SPACE: SpaceId = "boards"

export function getSpace(id: SpaceId): Space {
  return SPACES.find((s) => s.id === id) ?? SPACES[0]
}

/**
 * Deriva o space a partir da URL. A rota é a fonte da verdade: um link direto
 * para /app/comercial/pipeline abre o app já no space certo. Retorna null
 * quando a rota é comum a todos (ex.: /app, /app/office) — aí vale o escolhido.
 */
export function spaceFromPath(pathname: string, search = ""): SpaceId | null {
  // Campanhas de marketing reaproveitam o board (/app/boards?type=marketing):
  // é a query, não o caminho, que diz a qual space a tela pertence.
  if (pathname.startsWith("/app/boards")) {
    return new URLSearchParams(search).get("type") === "marketing" ? "marketing" : "boards"
  }
  const hit = SPACES.find((s) => s.match.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
  return hit?.id ?? null
}
