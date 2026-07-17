import { describe, expect, it } from "vitest"

import {
  GALLERY_PRESETS,
  decodeShare,
  encodeShare,
  parsePreset,
  serializePreset,
  validateConfig,
} from "./avatar.preset"
import { mulberry32, randomAvatar } from "./avatar.random"
import { DEFAULT_AVATAR } from "./avatar.types"

describe("preset JSON", () => {
  it("roundtrip serializa e reconstrói config idêntico", () => {
    const result = parsePreset(serializePreset(DEFAULT_AVATAR))
    expect(result.ok).toBe(true)
    expect(result.config).toEqual(DEFAULT_AVATAR)
  })

  it("rejeita JSON quebrado", () => {
    expect(parsePreset("{nope").ok).toBe(false)
  })

  it("rejeita versão futura", () => {
    const file = JSON.stringify({ version: 99, config: DEFAULT_AVATAR })
    const result = parsePreset(file)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/versão/)
  })

  it("rejeita índice fora do catálogo com erro específico", () => {
    const bad = { ...DEFAULT_AVATAR, hairStyle: 999 }
    const result = validateConfig(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("hairStyle"))).toBe(true)
  })

  it("todos os 8 presets da galeria são válidos", () => {
    expect(GALLERY_PRESETS).toHaveLength(8)
    for (const preset of GALLERY_PRESETS) {
      expect(validateConfig(preset.config).ok).toBe(true)
    }
  })
})

describe("URL compartilhável", () => {
  it("roundtrip encode/decode", () => {
    const cfg = { ...DEFAULT_AVATAR, name: "Zé do Pixel", hair: 3 }
    const result = decodeShare(encodeShare(cfg))
    expect(result.ok).toBe(true)
    expect(result.config).toEqual(cfg)
  })

  it("é URL-safe (sem +, / ou =)", () => {
    const encoded = encodeShare(DEFAULT_AVATAR)
    expect(encoded).not.toMatch(/[+/=]/)
  })

  it("rejeita lixo", () => {
    expect(decodeShare("@@@").ok).toBe(false)
  })
})

describe("randomAvatar", () => {
  it("mesma seed produz o mesmo avatar", () => {
    expect(randomAvatar(42)).toEqual(randomAvatar(42))
  })

  it("seeds diferentes produzem avatares diferentes", () => {
    expect(randomAvatar(1)).not.toEqual(randomAvatar(2))
  })

  it("sempre gera config válido", () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(validateConfig(randomAvatar(seed)).ok).toBe(true)
    }
  })

  it("acessório aparece em ~40% (probabilístico com seed fixa)", () => {
    let withAcc = 0
    for (let seed = 0; seed < 200; seed++) {
      if (randomAvatar(seed).acc !== 0) withAcc++
    }
    expect(withAcc).toBeGreaterThan(50)
    expect(withAcc).toBeLessThan(130)
  })

  it("mulberry32 gera valores em [0,1)", () => {
    const rnd = mulberry32(7)
    for (let i = 0; i < 100; i++) {
      const v = rnd()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
