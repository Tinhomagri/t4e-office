import { randomAvatar } from "@/features/avatar/avatar.random"

import type { ActiveCard } from "./pc/activeCard.api"
import type { DeskAssignment } from "./pc/desks.api"
import type { OfficeMember } from "./office.types"
import { buildFloor } from "./world/floors"

export const MOCK_WORKSPACE_ID = "office-demo"

const PEOPLE = [
  ["Ana Costa", "Implementar filtros salvos"],
  ["Bruno Lima", "Corrigir fluxo de recuperação de senha"],
  ["Carla Mendes", "Revisar a jornada de onboarding"],
  ["Diego Alves", "Criar indicadores do funil comercial"],
  ["Elisa Ramos", "Ajustar permissões por projeto"],
  ["Felipe Rocha", "Otimizar carregamento do dashboard"],
  ["Gabriela Nunes", "Preparar campanha de lançamento"],
  ["Henrique Melo", "Investigar erro na importação CSV"],
  ["Isabela Freitas", "Mapear métricas de retenção"],
  ["João Vitor", "Refinar componentes da biblioteca"],
  ["Karen Souza", "Atualizar documentação da API"],
  ["Lucas Martins", "Validar critérios da sprint"],
  ["Marina Lopes", "Criar visão de capacidade do time"],
  ["Nicolas Dias", "Implementar notificações de menção"],
  ["Olivia Barros", "Desenhar relatório executivo"],
  ["Paulo Castro", "Testar integração com calendário"],
  ["Quezia Reis", "Organizar backlog do trimestre"],
  ["Rafael Araujo", "Melhorar busca global"],
  ["Sofia Cardoso", "Revisar copy do portal do cliente"],
  ["Thiago Moreira", "Configurar alertas de SLA"],
  ["Ursula Paes", "Consolidar feedback da pesquisa"],
  ["Vinicius Teixeira", "Resolver inconsistência de status"],
  ["Wesley Farias", "Preparar ambiente de homologação"],
  ["Yasmin Correia", "Planejar conteúdo da próxima semana"],
] as const

const STATUS = ["available", "focus", "meeting", "away"] as const
const floorOne = buildFloor(1)

const startedAt = (index: number) =>
  new Date(Date.now() - (18 + index * 11) * 60_000).toISOString()

export const MOCK_MEMBERS: OfficeMember[] = PEOPLE.map(([name], index) => {
  const seat = floorOne.seats[index]!
  return {
    user_id: `demo-user-${index + 1}`,
    name,
    x: seat.x / floorOne.width,
    y: seat.y / floorOne.height,
    facing: seat.facing,
    status: STATUS[index % STATUS.length],
    avatar_config: randomAvatar(1200 + index, name),
  }
})

export const MOCK_DESK_ASSIGNMENTS: DeskAssignment[] = MOCK_MEMBERS.map((member, index) => ({
  seat_id: floorOne.seats[index]!.id,
  floor: 1,
  user_id: member.user_id,
  user_name: member.name,
}))

const MOCK_ACTIVE_CARDS = new Map<string, ActiveCard>(
  MOCK_MEMBERS.map((member, index) => [
    member.user_id,
    {
      active: true,
      card: {
        id: `demo-card-${index + 1}`,
        number: 120 + index,
        title: PEOPLE[index]![1],
        project: index % 2 === 0 ? "Produto" : "Operações",
      },
      doing_since: startedAt(index),
      working_note:
        index % 3 === 0
          ? "Em andamento no ambiente de demonstração."
          : undefined,
    },
  ]),
)

export function isOfficeMock(): boolean {
  return new URLSearchParams(window.location.search).get("mock") === "1"
}

export function getMockRoom(floor: number): OfficeMember[] {
  return floor === 1 ? MOCK_MEMBERS : []
}

export function getMockActiveCard(userId: string | null): ActiveCard | undefined {
  return userId ? MOCK_ACTIVE_CARDS.get(userId) : undefined
}
