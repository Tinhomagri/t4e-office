import { useEffect, useRef } from "react"
import Phaser from "phaser"
import { OfficeScene } from "@/features/office/game/scenes/OfficeScene"
import type { AvatarConfig } from "@/features/avatar/avatar.types"

interface Props {
  userId: string
  name: string
  avatar: AvatarConfig
}

export function GameCanvas({ userId, name, avatar }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      parent: containerRef.current,
      backgroundColor: "#eef1f4",
      pixelArt: true,
      scene: [OfficeScene],
      physics: { default: "arcade" },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    })

    gameRef.current.scene.start("OfficeScene", { userId, name, avatar })

    return () => {
      gameRef.current?.destroy(true)
      gameRef.current = null
    }
  }, [userId, name, avatar])

  return <div ref={containerRef} className="w-full h-full" />
}
