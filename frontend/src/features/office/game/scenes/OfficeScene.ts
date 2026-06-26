// src/features/office/game/scenes/OfficeScene.ts
import Phaser from "phaser"
import { compositeAvatar, makeAvatarTexKey, TILE } from "@/features/avatar/avatarRenderer"
import type { AvatarConfig } from "@/features/avatar/avatar.types"
import { MAP_TILES, MAP_W, MAP_H, TILE_SIZE, TILE_COLORS, TileType, DESK_TILE_POSITIONS } from "../map/mapData"
import { PlayerSprite } from "../entities/PlayerSprite"
import { RemoteSprite } from "../entities/RemoteSprite"
import { useOfficeStore } from "@/features/office/store/officeStore"
import { officeSocket } from "@/features/office/ws/officeSocket"

const STATUS_COLORS: Record<string, number> = {
  in_progress: 0x2f6df0,
  reviewing:   0x7c3aed,
  blocked:     0xdc2626,
  meeting:     0xd97706,
  afk:         0x6b7280,
}

const PROXIMITY_RADIUS_PX = TILE_SIZE * 3

export class OfficeScene extends Phaser.Scene {
  private player!: PlayerSprite
  private remotes = new Map<string, RemoteSprite>()
  private myUserId = ""
  private myAvatar: AvatarConfig = { skin: 0, cloth: 0, hair: 0, accessory: 0, configured: true }
  private myName = ""
  private eKey!: Phaser.Input.Keyboard.Key
  private nearDeskId: string | null = null
  private _unsubStore: (() => void) | null = null

  constructor() {
    super({ key: "OfficeScene" })
  }

  init(data: { userId: string; avatar: AvatarConfig; name: string }) {
    this.myUserId = data.userId
    this.myAvatar = data.avatar
    this.myName = data.name
  }

  preload() {
    this.load.image('roguelike', '/assets/characters/roguelike.png')
  }

  create() {
    this._drawMap()

    const texKey = this._genTexture(this.myAvatar)
    const spawnX = 10 * TILE_SIZE + TILE_SIZE / 2
    const spawnY = 35 * TILE_SIZE
    this.player = new PlayerSprite(this, spawnX, spawnY, texKey, this.myName)

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setZoom(2)
    this.cameras.main.setBounds(0, 0, MAP_W * TILE_SIZE, MAP_H * TILE_SIZE)

    this.eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E)

    this._subscribeToStore()
  }

  update(time: number) {
    this.player.update(time)
    this.remotes.forEach((sprite) => sprite.update())
    this._checkProximity()

    if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
      const store = useOfficeStore.getState()
      if (store.seatedDeskId) {
        officeSocket.send("stand")
        this.player.setSeated(false)
      } else if (this.nearDeskId) {
        officeSocket.send("sit", { desk_id: this.nearDeskId })
        this.player.setSeated(true)
      }
    }
  }

  private _genTexture(avatar: AvatarConfig): string {
    const key = makeAvatarTexKey(avatar.skin, avatar.cloth, avatar.hair, avatar.accessory)
    if (this.textures.exists(key)) return key

    const src = this.textures.get('roguelike').getSourceImage() as CanvasImageSource
    const canvas = document.createElement('canvas')
    canvas.width = TILE
    canvas.height = TILE
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    compositeAvatar(ctx, src, avatar.skin, avatar.cloth, avatar.hair, avatar.accessory)
    this.textures.addCanvas(key, canvas)
    return key
  }

  private _drawMap() {
    const gfx = this.add.graphics()

    for (let row = 0; row < MAP_TILES.length; row++) {
      for (let col = 0; col < MAP_TILES[row].length; col++) {
        const tile = MAP_TILES[row][col]
        const x = col * TILE_SIZE
        const y = row * TILE_SIZE
        const color = TILE_COLORS[tile]

        gfx.fillStyle(color, tile === TileType.GLASS ? 0.5 : 1)
        gfx.fillRect(x, y, TILE_SIZE, TILE_SIZE)

        if (tile === TileType.WALL) {
          gfx.lineStyle(1, 0x1a1a1a, 0.6)
          gfx.strokeRect(x, y, TILE_SIZE, TILE_SIZE)
        }

        if (tile === TileType.DESK) {
          gfx.fillStyle(0x222529, 1)
          gfx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4)
        }

        if (tile === TileType.PLANT) {
          gfx.fillStyle(0x6aa84f, 1)
          gfx.fillCircle(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 12)
          gfx.fillStyle(0x83c167, 1)
          gfx.fillCircle(x + TILE_SIZE / 2 - 4, y + TILE_SIZE / 2 - 4, 7)
        }

        if (tile === TileType.LOGO && row === 1) {
          const logoText = this.add.text(x, y + 4, "T4E", {
            fontSize: "14px", fontFamily: "Arial", fontStyle: "bold",
            color: "#1a1a1a",
          })
          if (col === 11) logoText.setText("TECNOLOGIA PARA TODOS")
        }
      }
    }
  }

  shutdown() {
    this._unsubStore?.()
    this._unsubStore = null
  }

  private _subscribeToStore() {
    this._unsubStore = useOfficeStore.subscribe((state) => {
      state.users.forEach((u) => {
        if (u.user_id === this.myUserId) return

        let remote = this.remotes.get(u.user_id)
        if (!remote) {
          const avatarCfg: AvatarConfig = {
            skin: u.skin ?? 0,
            cloth: u.cloth ?? 0,
            hair: u.hair ?? 0,
            accessory: u.accessory ?? 0,
            configured: true,
          }
          const key = this._genTexture(avatarCfg)
          remote = new RemoteSprite(this, u.x, u.y, key, u.name, u.user_id)
          this.remotes.set(u.user_id, remote)
        }

        remote.setTarget(u.x, u.y, u.dir)
        if (u.card) {
          remote.setStatusColor(STATUS_COLORS[u.card.status] ?? 0x6b7280)
        }
      })

      this.remotes.forEach((_, id) => {
        if (!state.users.has(id)) {
          this.remotes.get(id)?.destroy()
          this.remotes.delete(id)
        }
      })
    })
  }

  private _checkProximity() {
    const store = useOfficeStore.getState()
    const px = this.player.x
    const py = this.player.y

    let nearDesk: string | null = null

    store.users.forEach((u) => {
      if (u.user_id === this.myUserId || !u.desk_id) return
      const desk = store.desks.get(u.desk_id)
      if (!desk) return
      const dx = px - desk.tile_x * TILE_SIZE
      const dy = py - desk.tile_y * TILE_SIZE
      if (Math.sqrt(dx * dx + dy * dy) < PROXIMITY_RADIUS_PX) {
        nearDesk = u.desk_id
      }
    })

    this.nearDeskId = null
    for (const pos of DESK_TILE_POSITIONS) {
      const dx = px - pos.tx * TILE_SIZE
      const dy = py - pos.ty * TILE_SIZE
      if (Math.sqrt(dx * dx + dy * dy) < TILE_SIZE * 1.5) {
        store.desks.forEach((desk) => {
          if (desk.tile_x === pos.tx && desk.tile_y === pos.ty) {
            this.nearDeskId = desk.id
          }
        })
        break
      }
    }

    if (store.proximityDeskId !== nearDesk) {
      store.setProximityDeskId(nearDesk)
    }
  }
}

