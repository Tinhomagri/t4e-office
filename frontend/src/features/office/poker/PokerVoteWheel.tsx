// Roda de votação de quem senta na mesa em U — mesmo padrão visual da roda
// de emotes do OfficeRoom (botões redondos numa barra flutuante), só que
// cada botão é uma carta do deck Fibonacci em vez de uma animação.
import { useEffect, useState } from "react"

import { useHeartbeat, useJoinSession, useSubmitVote } from "@/features/poker/poker.hooks"
import { FIBONACCI } from "@/features/poker/poker.types"
import type { SessionStatus } from "@/features/poker/poker.types"

/** Barra flutuante de aviso — mesma moldura da roda, sem cartas. */
export function PokerSeatHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-16 left-1/2 max-w-[calc(100vw-2rem)] -translate-x-1/2 text-balance rounded-lg bg-ink-950/80 px-3 py-2 text-center text-[12px] text-white/80 backdrop-blur-sm">
      {children}
    </div>
  )
}

const NOT_VOTING_HINT: Record<string, string> = {
  waiting: "Sessão aguardando o host iniciar a votação",
  revealed: "Votos revelados — aguardando a próxima rodada",
  done: "Sessão encerrada",
}

export function PokerVoteWheel({
  sessionId,
  status,
  onClose,
}: {
  sessionId: string
  status: SessionStatus
  onClose: () => void
}) {
  const join = useJoinSession(sessionId)
  const submitVote = useSubmitVote(sessionId)
  const [error, setError] = useState<string | null>(null)

  // Sem heartbeat o backend tira a pessoa de `participants` depois de 30s
  // (ACTIVE_THRESHOLD) — a plaquinha sumia no meio da rodada.
  useHeartbeat(sessionId)

  // Sentar = entrar na sessão. Best-effort, igual ao heartbeat do resto do
  // mundo: se a pessoa já é participante, o backend só devolve 200 de novo.
  useEffect(() => {
    join.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // O backend recusa voto fora de "voting" (e sem card selecionado): mostrar
  // as cartas nesse estado só produziria cliques que falham em silêncio.
  if (status !== "voting") {
    return <PokerSeatHint>{NOT_VOTING_HINT[status] ?? "Votação fechada"}</PokerSeatHint>
  }

  // `max-w` + `flex-wrap`: as nove cartas em linha única pedem ~368px, e numa
  // janela estreita (celular, ou o Escritório numa coluna lateral) a barra
  // centrada transbordava dos dois lados — as cartas das pontas ficavam fora
  // da tela, sem como clicar. Agora ela quebra em duas linhas antes disso, e
  // as cartas encolhem um passo no limiar mais apertado.
  return (
    <div className="absolute bottom-16 left-1/2 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-col items-center gap-1">
      {error && (
        <p className="max-w-full rounded-md bg-red-600/90 px-2 py-1 text-center text-[11px] text-white">{error}</p>
      )}
      <div className="flex max-w-full flex-wrap justify-center gap-1 rounded-lg bg-ink-950/80 p-1.5 backdrop-blur-sm">
        {FIBONACCI.map((value) => (
          <button
            key={value}
            type="button"
            title={`Votar ${value}`}
            onClick={() => {
              setError(null)
              submitVote.mutate(value, {
                onSuccess: () => onClose(),
                onError: () => setError("Não foi possível votar agora."),
              })
            }}
            className="grid size-8 shrink-0 place-items-center rounded-md text-[13px] font-bold text-white transition-colors hover:bg-white/15 focus-ring min-[380px]:size-9 min-[380px]:text-sm"
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  )
}
