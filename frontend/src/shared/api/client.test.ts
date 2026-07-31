import { describe, expect, it } from "vitest"

import { extractApiError } from "./client"

function axiosLikeError(data: unknown, message = "Request failed"): unknown {
  return {
    isAxiosError: true,
    response: { data },
    message,
  }
}

describe("extractApiError", () => {
  it("retorna message quando o backend envia objeto em detail", () => {
    const error = axiosLikeError({
      detail: { code: "invalid_credentials", message: "Credenciais inválidas." },
    })

    expect(extractApiError(error)).toBe("Credenciais inválidas.")
  })

  it("retorna message quando o backend envia objeto em error", () => {
    const error = axiosLikeError({
      error: { code: "oauth_not_configured", message: "Google OAuth não configurado." },
    })

    expect(extractApiError(error)).toBe("Google OAuth não configurado.")
  })

  it("resolve mensagens aninhadas em arrays/campos", () => {
    const error = axiosLikeError({ email: ["Informe um email válido."] })

    expect(extractApiError(error)).toBe("Informe um email válido.")
  })

  it("usa a mensagem do axios quando o payload não traz texto", () => {
    const error = axiosLikeError({ code: "ERR_BAD_RESPONSE" }, "Request failed with status code 500")

    expect(extractApiError(error)).toBe("Request failed with status code 500")
  })

  it("usa mensagem de Error padrão fora do axios", () => {
    expect(extractApiError(new Error("Falha inesperada"))).toBe("Falha inesperada")
  })
})
