import {
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query"

import type { Card, CardStatus } from "@/features/workspace/workspace.types"

export type DropEdge = "before" | "after"

export interface CardDropResult {
  activeId: string
  destination: CardStatus
  beforeId: string | null
  afterId: string | null
  moved: boolean
}

export type CardQuerySnapshot = [QueryKey, Card[] | undefined]

export interface VerticalRect {
  top: number
  height: number
}

export function getDropEdge(active: VerticalRect, target: VerticalRect): DropEdge {
  const activeCenter = active.top + active.height / 2
  const targetCenter = target.top + target.height / 2
  return activeCenter < targetCenter ? "before" : "after"
}

export function applyCardDrop(cards: Card[], result: CardDropResult): Card[] {
  const active = cards.find((card) => card.id === result.activeId)
  if (!active) return cards

  const remaining = cards.filter((card) => card.id !== result.activeId)
  const movedCard = { ...active, status: result.destination }
  let insertionIndex = remaining.length

  if (result.afterId) {
    const afterIndex = remaining.findIndex((card) => card.id === result.afterId)
    if (afterIndex !== -1) insertionIndex = afterIndex
  } else if (result.beforeId) {
    const beforeIndex = remaining.findIndex((card) => card.id === result.beforeId)
    if (beforeIndex !== -1) insertionIndex = beforeIndex + 1
  } else {
    let lastDestinationIndex = -1
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (remaining[index].status === result.destination) {
        lastDestinationIndex = index
        break
      }
    }
    if (lastDestinationIndex !== -1) insertionIndex = lastDestinationIndex + 1
  }

  const next = [...remaining]
  next.splice(insertionIndex, 0, movedCard)
  return next
}

export function calculateCardDrop(
  cards: Card[],
  activeId: string,
  overId: string,
  edge: DropEdge = "after",
): CardDropResult | null {
  const active = cards.find((card) => card.id === activeId)
  if (!active || activeId === overId) return null

  const overCard = cards.find((card) => card.id === overId)
  const destination = (overCard?.status ?? overId) as CardStatus
  const destinationCards = cards.filter(
    (card) => card.status === destination && card.id !== activeId,
  )

  let beforeId: string | null
  let afterId: string | null

  if (overCard) {
    const targetIndex = destinationCards.findIndex((card) => card.id === overCard.id)
    if (targetIndex === -1) return null
    const insertionIndex = targetIndex + (edge === "after" ? 1 : 0)
    beforeId = destinationCards[insertionIndex - 1]?.id ?? null
    afterId = destinationCards[insertionIndex]?.id ?? null
  } else {
    beforeId = destinationCards[destinationCards.length - 1]?.id ?? null
    afterId = null
  }

  const provisional: CardDropResult = {
    activeId,
    destination,
    beforeId,
    afterId,
    moved: true,
  }
  const next = applyCardDrop(cards, provisional)
  const moved = cards.some(
    (card, index) => card.id !== next[index]?.id || card.status !== next[index]?.status,
  )

  return { ...provisional, moved }
}

export function applyCardDropToQueries(
  queryClient: QueryClient,
  projectId: string,
  result: CardDropResult,
): CardQuerySnapshot[] {
  const filter = { queryKey: ["cards", projectId] }
  const snapshots = queryClient.getQueriesData<Card[]>(filter)

  queryClient.setQueriesData<Card[]>(filter, (cards) => {
    if (!cards?.some((card) => card.id === result.activeId)) return cards
    return applyCardDrop(cards, result)
  })

  return snapshots
}

export function restoreCardQuerySnapshots(
  queryClient: QueryClient,
  snapshots: CardQuerySnapshot[],
) {
  for (const [queryKey, cards] of snapshots) {
    queryClient.setQueryData(queryKey, cards)
  }
}
