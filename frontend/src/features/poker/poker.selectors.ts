import type { PokerSession } from "./poker.types"

/**
 * Qual sessão é "a que está rolando agora" na sala de poker do andar 2.
 * Prioriza votação/reveal em curso; sem isso, cai para uma sessão aguardando
 * o host começar. Sessões concluídas não contam — não há "sessão implícita
 * do andar", quem decide o que abrir é o host pelo console.
 */
export function pickActiveSession(sessions: PokerSession[]): PokerSession | null {
  return (
    sessions.find((s) => s.status === "voting" || s.status === "revealed") ??
    sessions.find((s) => s.status === "waiting") ??
    null
  )
}
