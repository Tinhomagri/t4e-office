import Phaser from "phaser"
import { TILE_SIZE, SOLID_TILES, MAP_TILES } from "../map/mapData"
import { officeSocket } from "@/features/office/ws/officeSocket"
import type { Direction } from "@/features/office/office.types"

const SPEED = 160
const SEND_INTERVAL_MS = 100  // 10fps

export class PlayerSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite
  private nameTag: Phaser.GameObjects.Text
  private keys: Phaser.Types.Input.Keyboard.CursorKeys & { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key }
  private lastSentAt = 0
  private lastDir: Direction = "down"
  private isSeated = false
  private _textureKey: string

  constructor(scene: Phaser.Scene, x: number, y: number, textureKey: string, tint: number, name: string) {
    super(scene, x, y)
    this._textureKey = textureKey

    this.sprite = scene.add.sprite(0, 0, textureKey, 0)
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setScale(0.38)
    this.sprite.setTint(tint)
    this.add(this.sprite)

    this.nameTag = scene.add.text(0, -52, name, {
      fontSize: "10px",
      fontFamily: "monospace",
      backgroundColor: "#1a1a1a",
      color: "#ffffff",
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1)
    this.add(this.nameTag)

    const kb = scene.input.keyboard!
    const cursors = kb.createCursorKeys()
    this.keys = {
      ...cursors,
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    scene.add.existing(this)
  }

  setSeated(seated: boolean) {
    this.isSeated = seated
  }

  update(time: number) {
    if (this.isSeated) {
      this.sprite.setFrame(this._idleFrameFor(this.lastDir))
      this.sprite.setFlipX(this.lastDir === 'left')
      return
    }

    let vx = 0
    let vy = 0
    const k = this.keys

    if (k.left.isDown || k.a.isDown)  vx = -SPEED
    if (k.right.isDown || k.d.isDown) vx =  SPEED
    if (k.up.isDown || k.w.isDown)    vy = -SPEED
    if (k.down.isDown || k.s.isDown)  vy =  SPEED

    if (vx !== 0 && vy !== 0) {
      vx *= 0.707
      vy *= 0.707
    }

    let dir: Direction = this.lastDir
    if      (vy < 0) dir = "up"
    else if (vy > 0) dir = "down"
    else if (vx < 0) dir = "left"
    else if (vx > 0) dir = "right"

    const moving = vx !== 0 || vy !== 0
    const dt = this.scene.game.loop.delta / 1000

    if (moving) {
      this.lastDir = dir
      const nx = this.x + vx * dt
      const ny = this.y + vy * dt

      if (this._canMoveTo(nx, this.y)) this.x = nx
      if (this._canMoveTo(this.x, ny)) this.y = ny

      const animName = `${this._textureKey}_${dir}`
      if (this.sprite.anims.currentAnim?.key !== animName) {
        this.sprite.play(animName)
      }
      this.sprite.setFlipX(dir === 'left')
    } else {
      this.sprite.setFrame(this._idleFrameFor(dir))
      this.sprite.setFlipX(dir === 'left')
    }

    if (moving && time - this.lastSentAt > SEND_INTERVAL_MS) {
      officeSocket.send("move", { x: Math.round(this.x), y: Math.round(this.y), dir })
      this.lastSentAt = time
    }
  }

  private _canMoveTo(nx: number, ny: number): boolean {
    const tx = Math.floor(nx / TILE_SIZE)
    const ty = Math.floor(ny / TILE_SIZE)
    if (ty < 0 || ty >= MAP_TILES.length || tx < 0 || tx >= MAP_TILES[0].length) return false
    return !SOLID_TILES.has(MAP_TILES[ty][tx])
  }

  private _idleFrameFor(dir: Direction): number {
    const dirFrame: Record<Direction, number> = { down: 0, left: 9, right: 9, up: 18 }
    return dirFrame[dir]
  }
}
