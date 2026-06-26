import { useOfficeStore } from "@/features/office/store/officeStore"

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  in_progress: { label: "🔧 Em progresso", color: "bg-blue-100 text-blue-700" },
  reviewing:   { label: "👀 Em revisão",   color: "bg-purple-100 text-purple-700" },
  blocked:     { label: "🔴 Bloqueado",    color: "bg-red-100 text-red-700" },
  meeting:     { label: "📅 Reunião",      color: "bg-orange-100 text-orange-700" },
  afk:         { label: "💤 Ausente",      color: "bg-gray-100 text-gray-700" },
}

export function ProximityCard() {
  const proximityDeskId = useOfficeStore((s) => s.proximityDeskId)
  const hoveredUserId = useOfficeStore((s) => s.hoveredUserId)
  const users = useOfficeStore((s) => s.users)

  // Quem está na mesa de proximidade ou sendo hovered
  const targetUser = (() => {
    if (hoveredUserId) return users.get(hoveredUserId)
    if (proximityDeskId) {
      return Array.from(users.values()).find((u) => u.desk_id === proximityDeskId)
    }
    return undefined
  })()

  if (!targetUser?.card) return null

  const { card, name } = targetUser
  const st = STATUS_LABELS[card.status] ?? STATUS_LABELS.in_progress
  const isHover = !!hoveredUserId

  return (
    <div
      className={`absolute left-4 bottom-16 z-30 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 transition-all duration-200 ${isHover ? "w-80" : "w-64"}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="font-bold text-sm text-gray-800">{name}</div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
      </div>

      {card.title && (
        <p className="text-sm text-gray-600 leading-relaxed">{card.title}</p>
      )}

      {isHover && card.eta && (
        <p className="text-xs text-gray-400 mt-2">⏱ {card.eta}</p>
      )}
    </div>
  )
}
