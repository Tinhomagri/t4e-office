import { Users } from "lucide-react"

import { ComingSoon } from "@/shared/ui/ComingSoon"

export function OfficePage() {
  return (
    <ComingSoon
      icon={Users}
      eyebrow="Escritório Virtual"
      title="Presença e proximidade"
      subtitle="Um mapa 2D onde cada pessoa é um avatar — a camada de presença da equipe."
      phase="Fase 5 · Presence"
      features={[
        "Avatar e status automático (disponível/foco/reunião/ausente)",
        "Salas com propósito (mesas, reunião, foco, social)",
        "Proximidade abre canal de voz/vídeo leve",
        "Áudio espacial por distância",
        "Salas de foco silenciam notificações",
        "Sincronização via WebSocket + heartbeat",
      ]}
    />
  )
}
