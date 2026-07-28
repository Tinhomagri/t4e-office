import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DecorBoundary } from "./DecorBoundary"

function Boom(): JSX.Element {
  throw new Error("textura 404")
}

describe("DecorBoundary", () => {
  beforeEach(() => {
    // React loga o erro capturado; silenciar mantém a saída do teste legível.
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it("deixa passar o conteúdo quando nada falha", () => {
    render(
      <DecorBoundary>
        <p>cena</p>
      </DecorBoundary>,
    )
    expect(screen.getByText("cena")).toBeInTheDocument()
  })

  it("contém o erro em vez de derrubar a árvore", () => {
    // O incidente real: textura 404 matava a tela de login inteira.
    render(
      <div>
        <DecorBoundary>
          <Boom />
        </DecorBoundary>
        <button>Entrar</button>
      </div>,
    )
    // O que importa: o formulário continua utilizável.
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument()
  })

  it("registra a falha em vez de engolir em silêncio", () => {
    render(
      <DecorBoundary>
        <Boom />
      </DecorBoundary>,
    )
    expect(console.error).toHaveBeenCalled()
  })

  it("mostra o fallback quando fornecido", () => {
    render(
      <DecorBoundary fallback={<span>sem cena</span>}>
        <Boom />
      </DecorBoundary>,
    )
    expect(screen.getByText("sem cena")).toBeInTheDocument()
  })
})
