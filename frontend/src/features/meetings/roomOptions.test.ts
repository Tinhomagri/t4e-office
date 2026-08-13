import { describe, expect, it } from "vitest"

import { ROOM_OPTIONS } from "./roomOptions"

// Estes números são a diferença entre uma sala de 9 pessoas puxando 120 Mbps
// do escritório e puxando ~20. Nada aqui quebra em tela: se alguém desligar
// uma dessas opções, ninguém percebe até a internet da empresa cair de novo.
describe("configuração de mídia das salas", () => {
  it("manda só a camada que cabe no tamanho exibido", () => {
    // Sem isto, cada cartão de 128×96 recebe vídeo em qualidade cheia.
    expect(ROOM_OPTIONS.adaptiveStream).toBe(true)
  })

  it("para de transmitir o que ninguém está vendo", () => {
    // Economia no upload, que é o lado estreito do link de escritório.
    expect(ROOM_OPTIONS.dynacast).toBe(true)
  })

  it("publica em camadas, para o servidor poder escolher por espectador", () => {
    expect(ROOM_OPTIONS.publishDefaults?.simulcast).toBe(true)
    expect(ROOM_OPTIONS.publishDefaults?.videoSimulcastLayers?.length).toBeGreaterThan(0)
  })

  it("captura no máximo 360p a 15 quadros", () => {
    const captura = ROOM_OPTIONS.videoCaptureDefaults?.resolution
    expect(captura?.height).toBeLessThanOrEqual(360)
    expect(captura?.frameRate).toBeLessThanOrEqual(15)
  })

  it("não gasta banda com silêncio", () => {
    // Com 9 pessoas e uma falando, são 8 fluxos que praticamente zeram.
    expect(ROOM_OPTIONS.publishDefaults?.dtx).toBe(true)
  })

  it("protege a voz contra perda de pacote", () => {
    // Wi-Fi cheio derruba pacote; sem redundância a voz picota.
    expect(ROOM_OPTIONS.publishDefaults?.red).toBe(true)
  })
})
