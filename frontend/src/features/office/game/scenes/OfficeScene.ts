// src/features/office/game/scenes/OfficeScene.ts
import Phaser from "phaser"
import { generateAvatarSheet } from "@/features/avatar/avatarRenderer"
import type { AvatarConfig } from "@/features/avatar/avatar.types"
import { MAP_TILES, MAP_W, MAP_H, TILE_SIZE, TILE_COLORS, TileType, DESK_TILE_POSITIONS } from "../map/mapData"
import { PlayerSprite } from "../entities/PlayerSprite"
import { RemoteSprite } from "../entities/RemoteSprite"
import { useOfficeStore } from "@/features/office/store/officeStore"
import { officeSocket } from "@/features/office/ws/officeSocket"
import type { Direction } from "@/features/office/office.types"

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
  private myAvatarKey = ""
  private eKey!: Phaser.Input.Keyboard.Key
  private nearDeskId: string | null = null
  private _unsubStore: (() => void) | null = null

  constructor() {
    super({ key: "OfficeScene" })
  }

  init(data: { userId: string; avatar: AvatarConfig; name: string }) {
    this.myUserId = data.userId
    this.myAvatarKey = `avatar_${data.userId}`

    // Gera e registra spritesheet do player
    const sheet = generateAvatarSheet(data.avatar)
    this.textures.addCanvas(this.myAvatarKey, sheet)
    this._registerAnims(this.myAvatarKey)
  }

  create() {
    this._drawMap()

    // Spawneia o player na entrada (tile 10, 35)
    const spawnX = 10 * TILE_SIZE + TILE_SIZE / 2
    const spawnY = 35 * TILE_SIZE
    this.player = new PlayerSprite(this, spawnX, spawnY, this.myAvatarKey, "Eu")

    // Câmera segue o player
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setZoom(1.5)
    this.cameras.main.setBounds(0, 0, MAP_W * TILE_SIZE, MAP_H * TILE_SIZE)

    this.eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E)

    // Subscreve no store para atualizar remotes
    this._subscribeToStore()
  }

  update(time: number) {
    this.player.update(time)

    // Atualizar remotes
    this.remotes.forEach((sprite) => sprite.update())

    // Detectar proximidade de mesa
    this._checkProximity()

    // Tecla E para sentar/levantar
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

        // Borda preta nas paredes
        if (tile === TileType.WALL) {
          gfx.lineStyle(1, 0x1a1a1a, 0.6)
          gfx.strokeRect(x, y, TILE_SIZE, TILE_SIZE)
        }

        // Detalhe visual nas mesas
        if (tile === TileType.DESK) {
          gfx.fillStyle(0x222529, 1)
          gfx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4)
        }

        // Planta — círculo verde
        if (tile === TileType.PLANT) {
          gfx.fillStyle(0x6aa84f, 1)
          gfx.fillCircle(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 12)
          gfx.fillStyle(0x83c167, 1)
          gfx.fillCircle(x + TILE_SIZE / 2 - 4, y + TILE_SIZE / 2 - 4, 7)
        }

        // Logo T4E no topo
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

  private _registerAnims(key: string) {
    const dirs: Direction[] = ["down", "left", "right", "up"]
    dirs.forEach((dir, row) => {
      this.anims.create({
        key: `${key}_${dir}`,
        frames: [
          { key, frame: row * 3 + 1 },
          { key, frame: row * 3 + 0 },
          { key, frame: row * 3 + 2 },
        ],
        frameRate: 8,
        repeat: -1,
      })
    })
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
          // Criar sprite para novo usuário
          const key = `avatar_${u.user_id}`
          if (!this.textures.exists(key)) {
            const sheet = generateAvatarSheet({
              skin: u.skin, cloth: u.cloth, hair: u.hair, accessory: u.accessory,
              configured: true,
            })
            this.textures.addCanvas(key, sheet)
            this._registerAnims(key)
          }
          remote = new RemoteSprite(this, u.x, u.y, key, u.name)
          this.remotes.set(u.user_id, remote)
        }

        remote.setTarget(u.x, u.y, u.dir)
        if (u.card) {
          remote.setStatusColor(STATUS_COLORS[u.card.status] ?? 0x6b7280)
        }
      })

      // Remover usuários que saíram
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

    // Verificar proximidade das mesas
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

    // Detectar mesa próxima para sentar
    this.nearDeskId = null
    for (const pos of DESK_TILE_POSITIONS) {
      const dx = px - pos.tx * TILE_SIZE
      const dy = py - pos.ty * TILE_SIZE
      if (Math.sqrt(dx * dx + dy * dy) < TILE_SIZE * 1.5) {
        // Encontrar desk_id correspondente
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
