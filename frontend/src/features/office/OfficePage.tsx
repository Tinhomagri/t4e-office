import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/features/auth/auth.store"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { officeSocket } from "@/features/office/ws/officeSocket"
import { useOfficeStore } from "@/features/office/store/officeStore"
import { GameCanvas } from "@/features/office/components/GameCanvas"
import { CardPanel } from "@/features/office/components/CardPanel"
import { ProximityCard } from "@/features/office/components/ProximityCard"
import { Minimap } from "@/features/office/components/Minimap"
import { Topbar } from "@/features/office/components/Topbar"
import type { AvatarConfig } from "@/features/avatar/avatar.types"
import type { DeskState } from "@/features/office/office.types"

export function OfficePage() {
  const navigate = useNavigate()
  const authUser = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const { setMyUser, setDesks } = useOfficeStore()

  const { data: avatar, isLoading: loadingAvatar } = useQuery<AvatarConfig>({
    queryKey: ["avatar"],
    queryFn: () => api.get("/office/avatar/").then((r) => r.data),
  })

  const { data: desks } = useQuery<DeskState[]>({
    queryKey: ["desks"],
    queryFn: () => api.get("/office/desks/").then((r) => r.data),
  })

  useEffect(() => {
    if (avatar && !avatar.configured) navigate("/onboarding")
  }, [avatar, navigate])

  useEffect(() => {
    if (desks) setDesks(desks)
  }, [desks, setDesks])

  useEffect(() => {
    if (!accessToken) return
    officeSocket.connect()
    return () => officeSocket.disconnect()
  }, [accessToken])

  useEffect(() => {
    if (avatar && authUser) {
      setMyUser(authUser.id, avatar)
    }
  }, [avatar, authUser, setMyUser])

  if (loadingAvatar || !avatar || !authUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#eef1f4]">
        <div className="text-sm text-gray-500">Entrando no escritório…</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#eef1f4] overflow-hidden">
      <Topbar />
      <div className="flex flex-1 overflow-hidden relative">
        <GameCanvas userId={authUser.id} name={authUser.full_name} avatar={avatar} />
        <CardPanel />
        <ProximityCard />
      </div>
      <Minimap />
    </div>
  )
}
