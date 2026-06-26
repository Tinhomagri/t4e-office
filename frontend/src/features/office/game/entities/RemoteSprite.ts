// src/features/office/game/entities/RemoteSprite.ts
import Phaser from "phaser"
import type { Direction } from "@/features/office/office.types"

const LERP = 0.12

export class RemoteSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite
  private nameTag: Phaser.GameObjects.Text
  private statusDot: Phaser.GameObjects.Graphics
  private targetX: number
  private targetY: number
  private _textureKey: string

  constructor(scene: Phaser.Scene, x: number, y: number, textureKey: string, name: string) {
    super(scene, x, y)
    this._textureKey = textureKey
    this.targetX = x
    this.targetY = y

    this.sprite = scene.add.sprite(0, 0, textureKey, 0)
    this.sprite.setOrigin(0.5, 1)
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
  }

  setTarget(x: number, y: number, dir: Direction) {
    this.targetX = x
    this.targetY = y
    const animName = `${this._textureKey}_${dir}`
    if (this.sprite.anims.currentAnim?.key !== animName) {
      this.sprite.play(animName)
    }
  }

  setStatusColor(hex: number) {
    this.statusDot.clear()
    this.statusDot.fillStyle(hex, 1)
    this.statusDot.fillCircle(12, -52, 4)
  }

  setIdle(dir: Direction) {
    const dirRow: Record<Direction, number> = { down: 0, left: 1, right: 2, up: 3 }
    this.sprite.setFrame(dirRow[dir] * 3)
  }

  update() {
    this.x = Phaser.Math.Linear(this.x, this.targetX, LERP)
    this.y = Phaser.Math.Linear(this.y, this.targetY, LERP)
  }
}
