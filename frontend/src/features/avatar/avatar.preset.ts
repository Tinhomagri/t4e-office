// Presets nomeados, formato de arquivo versionado e URL compartilhável.
// A validação é manual (sem zod no projeto), mas cobre o mesmo contrato:
// campo a campo, com mensagens específicas por erro.
import {
  ACCESSORIES,
  BOTTOMS,
  DEFAULT_AVATAR,
  HAIR_STYLES,
  HANDHELDS,
  PAL,
  SHOES,
  TOPS,
  type AvatarConfig,
} from "./avatar.types"

export const PRESET_FORMAT_VERSION = 1

export interface AvatarPresetFile {
  version: number
  created_at: string // ISO 8601
  config: AvatarConfig
}

// ── Validação ────────────────────────────────────────────────────────────────

const INDEX_LIMITS: Record<string, number> = {
  skin: PAL.skin.length,
  hair: PAL.hair.length,
  hairStyle: HAIR_STYLES.length,
  top: TOPS.length,
  shirt: PAL.shirt.length,
  bottom: BOTTOMS.length,
  pants: PAL.pants.length,
  shoeType: SHOES.length,
  shoe: PAL.shoe.length,
  acc: ACCESSORIES.length,
  hand: HANDHELDS.length,
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  config?: AvatarConfig
}

export function validateConfig(raw: unknown): ValidationResult {
  const errors: string[] = []
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: ["config deve ser um objeto"] }
  }
  const obj = raw as Record<string, unknown>

  if (obj.gender !== "male" && obj.gender !== "female") {
    errors.push(`gender inválido: ${String(obj.gender)}`)
  }
  if (typeof obj.name !== "string" || obj.name.length > 60) {
    errors.push("name deve ser texto de até 60 caracteres")
  }
  for (const [field, limit] of Object.entries(INDEX_LIMITS)) {
    const v = obj[field]
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= limit) {
      errors.push(`${field} deve ser inteiro entre 0 e ${limit - 1}`)
    }
  }
  if (errors.length > 0) return { ok: false, errors }

  // Reconstrói só os campos conhecidos (descarta extras de versões futuras).
  const cfg: AvatarConfig = {
    ...DEFAULT_AVATAR,
    gender: obj.gender as AvatarConfig["gender"],
    name: obj.name as string,
  }
  for (const field of Object.keys(INDEX_LIMITS)) {
    ;(cfg as unknown as Record<string, number>)[field] = obj[field] as number
  }
  return { ok: true, errors: [], config: cfg }
}

export function serializePreset(config: AvatarConfig): string {
  const file: AvatarPresetFile = {
    version: PRESET_FORMAT_VERSION,
    created_at: new Date().toISOString(),
    config,
  }
  return JSON.stringify(file, null, 2)
}

export function parsePreset(text: string): ValidationResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, errors: ["arquivo não é JSON válido"] }
  }
  const file = raw as Partial<AvatarPresetFile>
  if (typeof file.version !== "number" || file.version > PRESET_FORMAT_VERSION) {
    return { ok: false, errors: [`versão de preset não suportada: ${String(file?.version)}`] }
  }
  return validateConfig(file.config)
}

// ── URL compartilhável (base64 URL-safe) ────────────────────────────────────

export function encodeShare(config: AvatarConfig): string {
  const json = JSON.stringify(config)
  const b64 = btoa(unescape(encodeURIComponent(json)))
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function decodeShare(param: string): ValidationResult {
  try {
    const b64 = param.replace(/-/g, "+").replace(/_/g, "/")
    const json = decodeURIComponent(escape(atob(b64)))
    return validateConfig(JSON.parse(json))
  } catch {
    return { ok: false, errors: ["parâmetro de compartilhamento inválido"] }
  }
}

// ── Galeria: 8 presets iniciais ──────────────────────────────────────────────

export interface NamedPreset {
  id: string
  label: string
  config: AvatarConfig
}

const p = (over: Partial<AvatarConfig>): AvatarConfig => ({ ...DEFAULT_AVATAR, ...over })

export const GALLERY_PRESETS: NamedPreset[] = [
  {
    id: "adventurer",
    label: "Aventureiro",
    config: p({ name: "Aventureiro", hairStyle: 7, hair: 1, top: 2, shirt: 9, bottom: 0, pants: 2, shoeType: 2, shoe: 5 }),
  },
  {
    id: "executive",
    label: "Executivo",
    config: p({ name: "Executivo", hairStyle: 0, hair: 0, top: 8, shirt: 10, pants: 1, shoeType: 1, shoe: 0 }),
  },
  {
    id: "punk",
    label: "Punk",
    config: p({ name: "Punk", hairStyle: 6, hair: 9, top: 5, shirt: 11, pants: 1, shoeType: 2, shoe: 0 }),
  },
  {
    id: "nurse",
    label: "Enfermeira",
    config: p({ name: "Enfermeira", gender: "female", hairStyle: 0, hair: 5, top: 4, shirt: 7, pants: 0, shoeType: 4, shoe: 3 }),
  },
  {
    id: "student",
    label: "Estudante",
    config: p({ name: "Estudante", hairStyle: 11, hair: 4, top: 0, shirt: 14, pants: 3, hand: 2 }),
  },
  {
    id: "guardian",
    label: "Guardião",
    config: p({ name: "Guardião", hairStyle: 0, hair: 1, top: 6, shirt: 12, pants: 7, shoeType: 2, shoe: 1 }),
  },
  {
    id: "artist",
    label: "Artista",
    config: p({ name: "Artista", gender: "female", hairStyle: 8, hair: 11, top: 5, shirt: 3, bottom: 3, pants: 9, acc: 3 }),
  },
  {
    id: "elegant",
    label: "Elegante",
    config: p({ name: "Elegante", gender: "female", hairStyle: 4, hair: 2, top: 7, shirt: 5, bottom: 3, pants: 4, shoeType: 4, shoe: 3 }),
  },
]
