// O que mostrar na plaquinha de voto acima da cabeça do avatar — puro, sem
// canvas, para poder provar em teste (engine.ts não dá para instanciar em
// jsdom, então a decisão de conteúdo mora fora dele).
export interface PokerBadge {
  text: string
  revealed: boolean
}

/** `null` = avatar não votou ainda, não desenha nada. */
export function pokerBadgeFor(vote: string | null, revealed: boolean): PokerBadge | null {
  if (vote === null) return null
  return { text: revealed ? vote : "?", revealed }
}
