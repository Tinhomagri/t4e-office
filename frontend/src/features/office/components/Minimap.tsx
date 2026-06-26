import { useEffect, useRef } from "react"
import { useOfficeStore } from "@/features/office/store/officeStore"
import { MAP_W, MAP_H, TILE_SIZE } from "@/features/office/game/map/mapData"

const SCALE = 3  // pixels por tile no minimap

const CLOTH_COLORS = ["#2f6df0","#22c55e","#f97316","#7c3aed","#ec4899","#6b7280"]

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const users = useOfficeStore((s) => s.users)
  const myUserId = useOfficeStore((s) => s.myUserId)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Fundo
    ctx.fillStyle = "#eef1f4"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Cada usuário como um ponto
    users.forEach((u) => {
      const mx = (u.x / TILE_SIZE) * SCALE
      const my = (u.y / TILE_SIZE) * SCALE
      ctx.fillStyle = u.user_id === myUserId ? "#ffffff" : CLOTH_COLORS[u.cloth % CLOTH_COLORS.length]
      ctx.beginPath()
      ctx.arc(mx, my, u.user_id === myUserId ? 3 : 2, 0, Math.PI * 2)
      ctx.fill()
      if (u.user_id === myUserId) {
        ctx.strokeStyle = "#2f6df0"
        ctx.lineWidth = 1
        ctx.stroke()
      }
    })
  }, [users, myUserId])

  return (
    <div className="absolute bottom-2 left-2 z-20 rounded-xl overflow-hidden border border-gray-300 shadow-md bg-[#eef1f4]">
      <canvas
        ref={canvasRef}
        width={MAP_W * SCALE}
        height={MAP_H * SCALE}
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  )
}
