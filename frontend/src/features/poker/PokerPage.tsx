import { Spade } from "lucide-react"

import { ComingSoon } from "@/shared/ui/ComingSoon"

export function PokerPage() {
  return (
    <ComingSoon
      icon={Spade}
      eyebrow="Planning Poker"
      title="Estimativa colaborativa"
      subtitle="Voto secreto e simultâneo para estimar cards sem viés."
      phase="Fase 4 · Estimation"
      features={[
        "Sessão a partir do backlog real do projeto",
        "Voto secreto com cartas viradas até todos votarem",
        "Revelação simultânea com lock no servidor (sem vazar votos)",
        "Média, mediana, mín/máx e destaque de outliers",
        "Re-votação até consenso",
        "Ponto final gravado automaticamente no card",
      ]}
    />
  )
}
