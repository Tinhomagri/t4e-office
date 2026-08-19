import { api } from "@/shared/api/client"

export interface ActiveCardItem {
  id: string
  project_id: string
  number: number
  title: string
  project: string
  doing_since: string
  working_note: string
}

export interface ActiveCard {
  active: boolean
  cards?: ActiveCardItem[]
}

export async function getActiveCard(workspaceId: string, userId: string): Promise<ActiveCard> {
  const { data } = await api.get<ActiveCard>("/presence/active-card/", {
    params: { workspace_id: workspaceId, user_id: userId },
  })
  return data
}

export async function saveWorkingNote(input: { cardId: string; note: string }): Promise<void> {
  await api.patch("/presence/active-card/note/", { card_id: input.cardId, note: input.note })
}
