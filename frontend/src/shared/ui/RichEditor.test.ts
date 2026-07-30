import { describe, expect, it } from "vitest"

import { toHtml } from "./RichEditor"

// A IA responde texto puro; o editor guarda HTML. Esta conversão é o ponto onde
// a estrutura (tópicos, critérios de aceite) sobrevive ou se perde.
describe("toHtml", () => {
  it("transforma cada linha solta em parágrafo", () => {
    expect(toHtml("Primeira\nSegunda")).toBe("<p>Primeira</p><p>Segunda</p>")
  })

  it("agrupa linhas com marcador numa lista só", () => {
    expect(toHtml("- um\n- dois")).toBe(
      "<ul><li><p>um</p></li><li><p>dois</p></li></ul>",
    )
  })

  it("aceita os marcadores que a IA costuma usar", () => {
    expect(toHtml("* um\n• dois")).toBe(
      "<ul><li><p>um</p></li><li><p>dois</p></li></ul>",
    )
  })

  it("mantém a ordem ao alternar parágrafo e lista", () => {
    expect(toHtml("Contexto\n- um\nFim")).toBe(
      "<p>Contexto</p><ul><li><p>um</p></li></ul><p>Fim</p>",
    )
  })

  it("ignora linhas em branco", () => {
    expect(toHtml("Um\n\n\nDois")).toBe("<p>Um</p><p>Dois</p>")
  })

  it("escapa HTML do texto da IA", () => {
    // Sem escapar, um retorno com <script> seria injetado direto no documento.
    expect(toHtml("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    )
  })

  it("escapa dentro de item de lista também", () => {
    expect(toHtml("- a < b & c")).toBe("<ul><li><p>a &lt; b &amp; c</p></li></ul>")
  })

  it("devolve vazio para texto sem conteúdo", () => {
    expect(toHtml("   \n  ")).toBe("")
  })
})
