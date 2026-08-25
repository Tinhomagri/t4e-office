// Único lugar que conhece os apps do desktop do PC.
//
// O PC não tem telas próprias: cada app aponta para uma ROTA do produto, e a
// janela monta o sistema inteiro (AppShell + rotas) naquele caminho. Por isso
// aqui não há componente de página — trocar isso por `component` voltaria a
// abrir a página nua, sem sidebar nem header, que é o que impedia de usar o
// sistema por dentro do Win98.
import {
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LineChart,
  ListChecks,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  Monitor,
  Share2,
  Smile,
  Spade,
  Sparkles,
  SquareKanban,
  Target,
  UserPlus,
  Video,
} from "lucide-react"

/** Caminho real de cada app dentro do produto — o mesmo que a sidebar usa. */
const ROUTE: Record<string, string> = {
  boards: "/app/boards",
  myday: "/app",
  "my-card": "/app/my-card",
  poker: "/app/poker",
  reunioes: "/app/reunioes",
  chat: "/app/chat",
  comercial: "/app/comercial/dashboard",
  reports: "/app/reports",
  portfolio: "/app/portfolio",
  // Sem dashboard próprio: o app "marketing" abre o Meu Dia, que já cai na
  // aba Marketing pelo mesmo mecanismo do SpaceSwitcher (ver spaces.ts).
  marketing: "/app",
  "mkt-calendario": "/app/marketing/calendario",
  "mkt-fila": "/app/marketing/fila",
  "mkt-analytics": "/app/marketing/analytics",
  "mkt-redes": "/app/marketing/redes",
  integrations: "/app/integrations",
  avatar: "/app/avatar",
  members: "/app/members",
  desks: "/app/desks",
  copilot: "/app/copilot",
}

export type AppGroupId = "trabalho" | "comercial" | "marketing" | "sistema"

export interface AppGroup {
  id: AppGroupId
  label: string
}

export interface AppDef {
  id: string
  label: string
  group: AppGroupId
  /** Tamanho inicial da janela. Clampado ao painel na hora de abrir. */
  size: { w: number; h: number }
  /** Ícone próprio — a grade só é legível se cada app for reconhecível nela. */
  icon: LucideIcon
  /** Rota do produto que a janela abre. "" = app sem rota (não abre). */
  route: string
}

export const APP_GROUPS: AppGroup[] = [
  { id: "trabalho", label: "Trabalho" },
  { id: "comercial", label: "Comercial" },
  { id: "marketing", label: "Marketing" },
  { id: "sistema", label: "Sistema" },
]

const BIG = { w: 900, h: 600 }
const MED = { w: 760, h: 520 }

export const APPS: AppDef[] = [
  { id: "boards", label: "Boards", group: "trabalho", size: BIG, icon: SquareKanban, route: ROUTE["boards"] },
  { id: "myday", label: "Meu Dia", group: "trabalho", size: BIG, icon: LayoutDashboard, route: ROUTE["myday"] },
  { id: "my-card", label: "Meu Card", group: "trabalho", size: MED, icon: ClipboardList, route: ROUTE["my-card"] },
  { id: "poker", label: "Planning Poker", group: "trabalho", size: BIG, icon: Spade, route: ROUTE["poker"] },
  { id: "reunioes", label: "Reuniões", group: "trabalho", size: BIG, icon: Video, route: ROUTE["reunioes"] },
  { id: "chat", label: "Chat", group: "trabalho", size: BIG, icon: MessageCircle, route: ROUTE["chat"] },

  { id: "comercial", label: "Comercial", group: "comercial", size: BIG, icon: Target, route: ROUTE["comercial"] },
  { id: "reports", label: "Relatórios", group: "comercial", size: BIG, icon: LineChart, route: ROUTE["reports"] },
  { id: "portfolio", label: "Portfólio", group: "comercial", size: BIG, icon: Building2, route: ROUTE["portfolio"] },

  { id: "marketing", label: "Marketing", group: "marketing", size: BIG, icon: Megaphone, route: ROUTE["marketing"] },
  { id: "mkt-calendario", label: "Calendário", group: "marketing", size: BIG, icon: CalendarDays, route: ROUTE["mkt-calendario"] },
  { id: "mkt-fila", label: "Fila", group: "marketing", size: MED, icon: ListChecks, route: ROUTE["mkt-fila"] },
  { id: "mkt-analytics", label: "Analytics", group: "marketing", size: BIG, icon: BarChart3, route: ROUTE["mkt-analytics"] },
  { id: "mkt-redes", label: "Redes", group: "marketing", size: MED, icon: Share2, route: ROUTE["mkt-redes"] },

  { id: "integrations", label: "Agenda", group: "sistema", size: BIG, icon: CalendarClock, route: ROUTE["integrations"] },
  { id: "avatar", label: "Avatar", group: "sistema", size: BIG, icon: Smile, route: ROUTE["avatar"] },
  { id: "members", label: "Membros", group: "sistema", size: MED, icon: UserPlus, route: ROUTE["members"] },
  { id: "desks", label: "Mesas", group: "sistema", size: MED, icon: Monitor, route: ROUTE["desks"] },
  { id: "copilot", label: "Copiloto", group: "sistema", size: MED, icon: Sparkles, route: ROUTE["copilot"] },
]

export function appsOfGroup(group: AppGroupId): AppDef[] {
  return APPS.filter((a) => a.group === group)
}

export function appById(id: string): AppDef | undefined {
  return APPS.find((a) => a.id === id)
}

export function isEnabled(app: AppDef): boolean {
  return Boolean(app.route)
}
