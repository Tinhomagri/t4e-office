// Roda de votação de quem senta na mesa em U — mesmo padrão visual da roda
// de emotes do OfficeRoom (botões redondos numa barra flutuante), só que
// cada botão é uma carta do deck Fibonacci em vez de uma animação.
import { useEffect } from "react"

import { useJoinSession, useSubmitVote } from "@/features/poker/poker.hooks"
import { FIBONACCI } from "@/features/poker/poker.types"

export function PokerVoteWheel({
  sessionId,
  onClose,
}: {
  sessionId: string
  onClose: () => void
}) {
  const join = useJoinSession(sessionId)
  const submitVote = useSubmitVote(sessionId)

  // Sentar = entrar na sessão. Best-effort, igual ao heartbeat do resto do
  // mundo: se a pessoa já é participante, o backend só devolve 200 de novo.
  useEffect(() => {
    join.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  return (
    <div className="absolute bottom-16 left-1/2 flex -translate-x-1/2 gap-1 rounded-lg bg-ink-950/80 p-1.5 backdrop-blur-sm">
      {FIBONACCI.map((value) => (
        <button
          key={value}
          type="button"
          title={`Votar ${value}`}
          onClick={() => {
            submitVote.mutate(value)
            onClose()
          }}
          className="grid size-9 place-items-center rounded-md text-sm font-bold text-white transition-colors hover:bg-white/15 focus-ring"
        >
          {value}
        </button>
      ))}
    </div>
  )
}
