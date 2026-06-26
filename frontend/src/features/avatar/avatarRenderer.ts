// src/features/avatar/avatarRenderer.ts
import type { AvatarConfig } from "./avatar.types"
import type { Direction } from "../office/office.types"

// Paletas
const SKIN_COLORS = ["#FDBCB4", "#EEA984", "#C68642", "#8D5524", "#4A2912"]
const CLOTH_COLORS = ["#2f6df0", "#22c55e", "#f97316", "#7c3aed", "#ec4899", "#6b7280"]
const HAIR_COLORS = ["#1a1a1a", "#8B4513", "#FFD700", "#808080"]

const FRAME_W = 32
const FRAME_H = 48
const COLS = 3
const ROWS = 4  // down, left, right, up

function drawFrame(
  ctx: CanvasRenderingContext2D,
  ox: number,  // offset x do frame no canvas
  oy: number,  // offset y do frame no canvas
  cfg: AvatarConfig,
  dir: Direction,
  walkFrame: 0 | 1 | 2,
) {
  const skin = SKIN_COLORS[cfg.skin]
  const cloth = CLOTH_COLORS[cfg.cloth]
  const hair = HAIR_COLORS[cfg.hair % HAIR_COLORS.length]

  // Legs
  const legOffset = walkFrame === 0 ? 0 : walkFrame === 1 ? -3 : 3
  ctx.fillStyle = cloth
  ctx.fillRect(ox + 10, oy + 34, 5, 12)   // perna esq
  ctx.fillRect(ox + 17, oy + 34, 5, 12)   // perna dir
  if (walkFrame !== 0) {
    ctx.clearRect(ox + 10, oy + 34, 5, 12)
    ctx.clearRect(ox + 17, oy + 34, 5, 12)
    ctx.fillStyle = cloth
    ctx.fillRect(ox + 10, oy + 34 + legOffset, 5, 12)
    ctx.fillRect(ox + 17, oy + 34 - legOffset, 5, 12)
  }

  // Body
  ctx.fillStyle = cloth
  ctx.fillRect(ox + 8, oy + 22, 16, 13)

  // Arms
  ctx.fillStyle = skin
  ctx.fillRect(ox + 4,  oy + 22, 4, 10)
  ctx.fillRect(ox + 24, oy + 22, 4, 10)

  // Head
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.arc(ox + 16, oy + 14, 9, 0, Math.PI * 2)
  ctx.fill()

  // Hair
  ctx.fillStyle = hair
  if (cfg.hair === 0) {
    // Liso curto
    ctx.fillRect(ox + 7, oy + 5, 18, 5)
    ctx.beginPath(); ctx.arc(ox + 16, oy + 10, 9, Math.PI, 0); ctx.fill()
  } else if (cfg.hair === 1) {
    // Liso longo
    ctx.fillRect(ox + 7, oy + 5, 18, 5)
    ctx.beginPath(); ctx.arc(ox + 16, oy + 10, 9, Math.PI, 0); ctx.fill()
    ctx.fillRect(ox + 7, oy + 14, 4, 8)
    ctx.fillRect(ox + 21, oy + 14, 4, 8)
  } else if (cfg.hair === 2) {
    // Cacheado
    for (let i = 0; i < 5; i++) {
      ctx.beginPath()
      ctx.arc(ox + 8 + i * 4, oy + 7, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // hair === 3: careca, sem desenho

  // Face (olhos simples)
  ctx.fillStyle = "#1a1a1a"
  if (dir !== "up") {
    ctx.fillRect(ox + 12, oy + 13, 2, 2)
    ctx.fillRect(ox + 18, oy + 13, 2, 2)
  }

  // Acessório
  if (cfg.accessory === 1) {
    // Óculos
    ctx.strokeStyle = "#1a1a1a"
    ctx.lineWidth = 1
    ctx.strokeRect(ox + 10, oy + 12, 5, 4)
    ctx.strokeRect(ox + 17, oy + 12, 5, 4)
    ctx.beginPath(); ctx.moveTo(ox + 15, oy + 14); ctx.lineTo(ox + 17, oy + 14); ctx.stroke()
  } else if (cfg.accessory === 2) {
    // Fone
    ctx.fillStyle = "#1a1a1a"
    ctx.fillRect(ox + 7, oy + 10, 2, 8)
    ctx.fillRect(ox + 23, oy + 10, 2, 8)
    ctx.fillRect(ox + 7, oy + 10, 18, 2)
  }
}

export function generateAvatarSheet(cfg: AvatarConfig): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = FRAME_W * COLS   // 96
  canvas.height = FRAME_H * ROWS  // 192
  const ctx = canvas.getContext("2d")!

  const dirs: Direction[] = ["down", "left", "right", "up"]

  dirs.forEach((dir, row) => {
    ;([0, 1, 2] as const).forEach((frame) => {
      const ox = frame * FRAME_W
      const oy = row * FRAME_H
      drawFrame(ctx, ox, oy, cfg, dir, frame)
    })
  })

  return canvas
}

// Retorna a chave de animação Phaser para uma direção
export function animKey(baseKey: string, dir: Direction): string {
  return `${baseKey}_${dir}`
}
