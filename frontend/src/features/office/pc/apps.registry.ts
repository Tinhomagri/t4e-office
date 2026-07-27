// Único lugar que conhece as páginas do produto.
//
// Nesta fatia só Boards e Comercial abrem: o resto entra com component null e
// aparece desabilitado. Ligar um app na fatia 2 é trocar null pelo componente —
// nada mais no PC precisa mudar.
import type { ComponentType } from "react"

import { BoardsPage } from "@/features/boards/BoardsPage"
import { SalesPage } from "@/features/sales/SalesPage"

export type AppGroupId = "trabalho" | "comercial" | "marketing" | "sistema"

export interface AppGroup {
  id: AppGroupId
  label: string
}

export interface AppDef {
  id: string
  label: string
  group: AppGroupId
  /** Tamanho inicial da janela. Generoso: as páginas assumem viewport cheia. */
  size: { w: number; h: number }
  /** null = ainda não ligado nesta fatia. */
  component: ComponentType | null
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
  { id: "boards", label: "Boards", group: "trabalho", size: BIG, component: BoardsPage },
  { id: "myday", label: "Meu Dia", group: "trabalho", size: MED, component: null },
  { id: "poker", label: "Planning Poker", group: "trabalho", size: BIG, component: null },

  { id: "comercial", label: "Comercial", group: "comercial", size: BIG, component: SalesPage },
  { id: "reports", label: "Relatórios", group: "comercial", size: BIG, component: null },
  { id: "portfolio", label: "Portfólio", group: "comercial", size: MED, component: null },

  { id: "mkt-calendario", label: "Calendário", group: "marketing", size: BIG, component: null },
  { id: "mkt-fila", label: "Fila", group: "marketing", size: MED, component: null },
  { id: "mkt-analytics", label: "Analytics", group: "marketing", size: BIG, component: null },
  { id: "mkt-redes", label: "Redes", group: "marketing", size: MED, component: null },

  { id: "integrations", label: "Integrações", group: "sistema", size: MED, component: null },
  { id: "avatar", label: "Avatar", group: "sistema", size: BIG, component: null },
  { id: "members", label: "Membros", group: "sistema", size: MED, component: null },
  { id: "copilot", label: "Copiloto", group: "sistema", size: MED, component: null },
  { id: "importar", label: "Importar", group: "sistema", size: MED, component: null },
]

export function appsOfGroup(group: AppGroupId): AppDef[] {
  return APPS.filter((a) => a.group === group)
}

export function appById(id: string): AppDef | undefined {
  return APPS.find((a) => a.id === id)
}

export function isEnabled(app: AppDef): boolean {
  return app.component !== null
}
