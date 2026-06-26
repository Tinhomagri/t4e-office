// src/features/office/game/entities/RemoteSprite.ts
import Phaser from "phaser"
import type { Direction } from "@/features/office/office.types"
import { useOfficeStore } from "@/features/office/store/officeStore"

const LERP = 0.12
const BOB_SPEED = 0.008
const BOB_AMP = 2
const MOVE_THRESHOLD = 1

export class RemoteSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Image
  private nameTag: Phaser.GameObjects.Text
  private statusDot: Phaser.GameObjects.Graphics
  private targetX: number
  private targetY: number

  constructor(scene: Phaser.Scene, x: number, y: number, textureKey: string, name: string, userId: string) {
    super(scene, x, y)
    this.targetX = x
    this.targetY = y

    this.sprite = scene.add.image(0, 0, textureKey)
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setScale(3)
    this.add(this.sprite)

    this.nameTag = scene.add.text(0, -52, name, {
      fontSize: "10px",
      fontFamily: "monospace",
      backgroundColor: "#1a1a1acc",
      color: "#ffffff",
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1)
    this.add(this.nameTag)

    this.statusDot = scene.add.graphics()
    this.statusDot.fillStyle(0x6b7280, 1)
    this.statusDot.fillCircle(12, -52, 4)
    this.add(this.statusDot)

    scene.add.existing(this)

    this.setSize(32, 48)
    this.setInteractive()
    scene.input.on("gameobjectover", (_ptr: unknown, obj: Phaser.GameObjects.GameObject) => {
      if (obj === this) useOfficeStore.getState().setHoveredUserId(userId)
    })
    scene.input.on("gameobjectout", (_ptr: unknown, obj: Phaser.GameObjects.GameObject) => {
      if (obj === this) useOfficeStore.getState().setHoveredUserId(null)
    })
  }

  setTarget(x: number, y: number, dir: Direction) {
    this.targetX = x
    this.targetY = y
    this.sprite.setFlipX(dir === 'left')
  }

  setStatusColor(hex: number) {
    this.statusDot.clear()
    this.statusDot.fillStyle(hex, 1)
    this.statusDot.fillCircle(12, -52, 4)
  }

  update() {
    this.x = Phaser.Math.Linear(this.x, this.targetX, LERP)
    this.y = Phaser.Math.Linear(this.y, this.targetY, LERP)

    const isMoving =
      Math.abs(this.targetX - this.x) > MOVE_THRESHOLD ||
      Math.abs(this.targetY - this.y) > MOVE_THRESHOLD

    const bob = isMoving ? Math.sin(this.scene.time.now * BOB_SPEED) * BOB_AMP : 0
    this.sprite.y = bob
    this.nameTag.y = -52 + bob
  }
}
