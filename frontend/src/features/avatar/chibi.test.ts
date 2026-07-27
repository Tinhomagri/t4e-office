import { describe, expect, it } from "vitest"

import { ANIMS, ANIM_FPS } from "./avatar.types"
import { poseFor } from "./chibi"

describe("poseFor", () => {
  it("idle segue o ciclo de body 0,0,1,1", () => {
    expect(poseFor("idle", 0).body).toBe(0)
    expect(poseFor("idle", 2).body).toBe(1)
    expect(poseFor("idle", 3).body).toBe(1)
    expect(poseFor("idle", 4).body).toBe(0) // ciclo reinicia
  })

  it("é determinística para o mesmo (anim, frame)", () => {
    expect(poseFor("walk", 5)).toEqual(poseFor("walk", 5))
  })

  it("wave mantém rosto feliz em todos os frames", () => {
    for (let f = 0; f < 5; f++) {
      expect(poseFor("wave", f).face).toBe("happy")
    }
  })

  it("anim desconhecida cai no fallback body 0", () => {
    expect(poseFor("inexistente", 0)).toEqual({ body: 0 })
  })

  // O jamal é o único clipe decalcado de vídeo. Estes testes travam a cadência
  // medida: mexer nos números sem remedir desafina o passo.
  describe("jamal", () => {
    it("roda a 12fps com frase de 16 frames = 1,333s", () => {
      expect(ANIMS.jamal).toBe(16)
      expect(ANIM_FPS.jamal).toBe(12)
      expect(ANIMS.jamal / ANIM_FPS.jamal).toBeCloseTo(1.333, 2)
    })

    it("mantém a amplitude vertical em 1px: 2 vira pogo num sprite de 32", () => {
      for (let f = 0; f < 16; f++) {
        expect(Math.abs(Number(poseFor("jamal", f).squash ?? 0))).toBeLessThanOrEqual(1)
      }
    })

    it("o gesto é antebraço cruzado, não braço erguido ao lado da cabeça", () => {
      // Braço erguido é armL/armR <= -3 no rig. O passinho não usa isso em
      // nenhum frame: quem desenha o movimento é crossL/crossR.
      let crossed = 0
      for (let f = 0; f < 16; f++) {
        const p = poseFor("jamal", f)
        expect(Number(p.armL ?? 0)).toBeGreaterThan(-3)
        expect(Number(p.armR ?? 0)).toBeGreaterThan(-3)
        if (p.crossL != null || p.crossR != null) crossed++
      }
      expect(crossed).toBe(14) // só os 2 contratempos ficam sem cruzar
    })

    it("o antebraço varre de cima (rosto) para baixo (peito)", () => {
      const alturas = [0, 1, 2, 3, 4].map((f) => Number(poseFor("jamal", f).crossR ?? 0))
      expect(alturas).toEqual([...alturas].sort((a, b) => a - b))
      expect(alturas[0]).toBeLessThan(0) // começa na altura do rosto
    })

    it("não levanta joelho alto: o passo é quique de pé quase junto", () => {
      for (let f = 0; f < 16; f++) {
        const p = poseFor("jamal", f)
        expect(Number(p.legL ?? 0)).toBeLessThanOrEqual(1)
        expect(Number(p.legR ?? 0)).toBeLessThanOrEqual(1)
      }
    })

    it("espelha o segundo meio: o antebraço troca de ombro", () => {
      for (let f = 0; f < 8; f++) {
        const a = poseFor("jamal", f)
        const b = poseFor("jamal", f + 8)
        expect(Number(a.crossR ?? 0)).toBe(Number(b.crossL ?? 0))
        expect(Number(a.reachR ?? 0)).toBe(Number(b.reachL ?? 0))
        expect(Number(a.lean ?? 0) + Number(b.lean ?? 0)).toBe(0)
      }
    })

    it("mantém o rosto feliz em todo o ciclo", () => {
      for (let f = 0; f < 16; f++) expect(poseFor("jamal", f).face).toBe("happy")
    })

    it("fecha o ciclo: o frame 16 é o frame 0", () => {
      expect(poseFor("jamal", 16)).toEqual(poseFor("jamal", 0))
    })
  })
})
