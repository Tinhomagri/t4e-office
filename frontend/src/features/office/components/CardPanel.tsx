import { useEffect, useRef, useState } from "react"
import { useOfficeStore } from "@/features/office/store/officeStore"
import { officeSocket } from "@/features/office/ws/officeSocket"
import type { CardStatus } from "@/features/office/office.types"

const STATUS_OPTIONS: { value: CardStatus; label: string; color: string }[] = [
  { value: "in_progress", label: "🔧 Em progresso", color: "bg-blue-500" },
  { value: "reviewing",   label: "👀 Em revisão",   color: "bg-purple-500" },
  { value: "blocked",     label: "🔴 Bloqueado",    color: "bg-red-500" },
  { value: "meeting",     label: "📅 Reunião",      color: "bg-orange-500" },
  { value: "afk",         label: "💤 Ausente",      color: "bg-gray-500" },
]

export function CardPanel() {
  const seatedDeskId = useOfficeStore((s) => s.seatedDeskId)
  const myUserId = useOfficeStore((s) => s.myUserId)
  const users = useOfficeStore((s) => s.users)

  const myUser = myUserId ? users.get(myUserId) : undefined
  const [title, setTitle] = useState(myUser?.card?.title ?? "")
  const [status, setStatus] = useState<CardStatus>(myUser?.card?.status ?? "in_progress")
  const [eta, setEta] = useState(myUser?.card?.eta ?? "")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (myUser?.card) {
      setTitle(myUser.card.title)
      setStatus(myUser.card.status)
      setEta(myUser.card.eta)
    }
  }, [seatedDeskId])

  function sendUpdate(updates: Partial<{ title: string; status: CardStatus; eta: string }>) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      officeSocket.send("card_update", { title, status, eta, ...updates })
    }, 800)
  }

  if (!seatedDeskId) return null

  return (
    <div className="absolute right-0 top-0 h-full w-72 bg-white border-l border-gray-200 shadow-xl flex flex-col p-4 gap-4 z-20">
      <h2 className="font-bold text-gray-800 text-sm">Meu Card</h2>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">O que estou fazendo</label>
        <textarea
          className="border border-gray-200 rounded-lg p-2 text-sm resize-none h-24 focus:outline-none focus:border-blue-400"
          placeholder="Describe o que está trabalhando…"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            sendUpdate({ title: e.target.value })
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Status</label>
        <select
          className="border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-blue-400"
          value={status}
          onChange={(e) => {
            const v = e.target.value as CardStatus
            setStatus(v)
            sendUpdate({ status: v })
          }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Previsão</label>
        <input
          className="border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-blue-400"
          placeholder="~2h, hoje EOD…"
          value={eta}
          onChange={(e) => {
            setEta(e.target.value)
            sendUpdate({ eta: e.target.value })
          }}
        />
      </div>

      <p className="text-xs text-gray-400 mt-auto">Salvo automaticamente · pressione E para levantar</p>
    </div>
  )
}
