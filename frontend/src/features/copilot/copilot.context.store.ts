import { create } from "zustand"

/**
 * Contexto da tela atual, publicado pelas telas e consumido pelo Copiloto.
 *
 * É o chip "Contexto: VAL-87" que o Jira mostra acima do input: sem ele, o
 * chat responde sobre o workspace inteiro e a pessoa precisa repetir por
 * escrito onde está. Quem sabe o que está aberto é a tela — por isso ela
 * publica, em vez de o widget tentar adivinhar pela URL.
 *
 * `hint` é o texto que entra na mensagem enviada à IA. `label` é o que a
 * pessoa lê no chip. Mantê-los separados evita mandar rótulo de UI para a IA
 * e evita mostrar prompt cru para a pessoa.
 */
export type CopilotContextKey = "project" | "card"

export interface CopilotContext {
  label: string
  hint: string
}

// Do mais específico para o mais genérico. Várias telas coexistem (o card abre
// *por cima* do board), então guardamos todas e mostramos a mais específica —
// fechar o card devolve o contexto do projeto sem ninguém republicar.
const PRIORITY: CopilotContextKey[] = ["card", "project"]

interface ContextState {
  contexts: Partial<Record<CopilotContextKey, CopilotContext>>
  /** false quando a pessoa fecha o chip: ela mandou não usar o contexto. */
  enabled: boolean
  setContext: (key: CopilotContextKey, context: CopilotContext) => void
  clearContext: (key: CopilotContextKey) => void
  setEnabled: (enabled: boolean) => void
}

export const useCopilotContextStore = create<ContextState>((set) => ({
  contexts: {},
  enabled: true,
  setContext: (key, context) =>
    // Reabilita ao publicar: fechar o chip do card A não deve deixar o card B
    // mudo. Só reabilita se o conteúdo mudou de fato, senão um re-render
    // desfaria a escolha da pessoa.
    set((s) =>
      s.contexts[key]?.hint === context.hint
        ? s
        : { contexts: { ...s.contexts, [key]: context }, enabled: true },
    ),
  clearContext: (key) =>
    set((s) => {
      if (!(key in s.contexts)) return s
      const next = { ...s.contexts }
      delete next[key]
      return { contexts: next }
    }),
  setEnabled: (enabled) => set({ enabled }),
}))

/** O contexto mais específico publicado, ou null se nenhuma tela publicou. */
export function useActiveCopilotContext(): CopilotContext | null {
  const contexts = useCopilotContextStore((s) => s.contexts)
  for (const key of PRIORITY) {
    const found = contexts[key]
    if (found) return found
  }
  return null
}
