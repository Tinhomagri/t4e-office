import { describe, expect, it } from "vitest"

import {
  canSend,
  discountExceedsSubtotal,
  formatMoney,
  formatQuantity,
  previewLineSubtotal,
  previewSubtotal,
  previewTotal,
  sortProposals,
  validityLabel,
} from "./proposals.shared"
import type { LineItemInput, Proposal } from "./proposals.types"

function item(overrides: Partial<LineItemInput> = {}): LineItemInput {
  return { description: "Serviço", quantity: "1", unit_price: "100", ...overrides }
}

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: "p1",
    workspace_id: "w1",
    deal_id: "d1",
    deal_title: "Projeto",
    customer_name: "Acme",
    number: 1,
    title: "Proposta",
    status: "draft",
    currency: "BRL",
    intro: "",
    terms: "",
    valid_until: null,
    items: [],
    discount: "0.00",
    subtotal: "0.00",
    total: "0.00",
    is_expired: false,
    is_editable: true,
    sent_at: null,
    sent_to: "",
    accepted_at: null,
    rejected_at: null,
    rejection_reason: "",
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

describe("formatMoney", () => {
  it("formata no padrão pt-BR com separador de milhar", () => {
    expect(formatMoney("3700.00")).toBe("R$ 3.700,00")
    expect(formatMoney("1234567.89")).toBe("R$ 1.234.567,89")
  })

  it("aceita a string Decimal que o DRF devolve", () => {
    expect(formatMoney("0.50")).toBe("R$ 0,50")
  })

  it("respeita outras moedas", () => {
    expect(formatMoney("10.00", "USD")).toBe("US$ 10,00")
    expect(formatMoney("10.00", "EUR")).toBe("€ 10,00")
  })

  it("não quebra com valor inválido", () => {
    expect(formatMoney("abc")).toBe("R$ 0,00")
  })
})

describe("formatQuantity", () => {
  it("esconde zeros à toa", () => {
    expect(formatQuantity("3.0000")).toBe("3")
  })

  it("preserva a fração quando existe", () => {
    expect(formatQuantity("7.5")).toBe("7,5")
  })
})

describe("previewLineSubtotal", () => {
  it("multiplica quantidade por valor unitário", () => {
    expect(previewLineSubtotal(item({ quantity: "10", unit_price: "250" }))).toBe(2500)
  })

  it("fecha o valor unitário em centavos ANTES de multiplicar", () => {
    // Espelha o domínio: 33,335 vira 33,34 e 3 × 33,34 = 100,02. Se a tela
    // multiplicasse em precisão cheia daria 100,01 e divergiria do PDF.
    expect(previewLineSubtotal(item({ quantity: "3", unit_price: "33.335" }))).toBe(100.02)
  })

  it("aceita vírgula como separador decimal", () => {
    // O usuário digita "1250,50" no campo — é o teclado brasileiro.
    expect(previewLineSubtotal(item({ quantity: "1", unit_price: "1250,50" }))).toBe(1250.5)
  })

  it("quantidade zero ou negativa não vira valor", () => {
    expect(previewLineSubtotal(item({ quantity: "0" }))).toBe(0)
    expect(previewLineSubtotal(item({ quantity: "-2" }))).toBe(0)
  })

  it("campo vazio não vira NaN na tela", () => {
    expect(previewLineSubtotal(item({ unit_price: "" }))).toBe(0)
    expect(previewLineSubtotal(item({ quantity: "" }))).toBe(0)
  })
})

describe("previewSubtotal e previewTotal", () => {
  it("soma as linhas", () => {
    expect(previewSubtotal([item({ unit_price: "100" }), item({ unit_price: "250.50" })])).toBe(
      350.5,
    )
  })

  it("desconta o desconto", () => {
    expect(previewTotal([item({ unit_price: "1000" })], "150")).toBe(850)
  })

  it("nunca fica negativo", () => {
    expect(previewTotal([item({ unit_price: "100" })], "500")).toBe(0)
  })

  it("lista vazia soma zero", () => {
    expect(previewSubtotal([])).toBe(0)
    expect(previewTotal([], "0")).toBe(0)
  })
})

describe("discountExceedsSubtotal", () => {
  it("acusa desconto maior que o subtotal antes de o backend recusar", () => {
    expect(discountExceedsSubtotal([item({ unit_price: "100" })], "150")).toBe(true)
  })

  it("desconto igual ao subtotal é permitido", () => {
    expect(discountExceedsSubtotal([item({ unit_price: "100" })], "100")).toBe(false)
  })
})

describe("canSend", () => {
  it("exige ao menos um item com descrição e quantidade", () => {
    expect(canSend([])).toBe(false)
    expect(canSend([item({ description: "   " })])).toBe(false)
    expect(canSend([item({ quantity: "0" })])).toBe(false)
    expect(canSend([item()])).toBe(true)
  })

  it("item de cortesia (valor zero) ainda permite enviar", () => {
    expect(canSend([item({ unit_price: "0" })])).toBe(true)
  })
})

describe("sortProposals", () => {
  it("ordena da mais recente para a mais antiga pelo número", () => {
    const lista = [proposal({ id: "a", number: 1 }), proposal({ id: "b", number: 5 })]
    expect(sortProposals(lista).map((p) => p.number)).toEqual([5, 1])
  })

  it("não muta o array original", () => {
    const lista = [proposal({ number: 1 }), proposal({ number: 2 })]
    sortProposals(lista)
    expect(lista.map((p) => p.number)).toEqual([1, 2])
  })
})

describe("validityLabel", () => {
  it("avisa quando não há prazo", () => {
    expect(validityLabel(proposal())).toBe("Sem prazo")
  })

  it("mostra o prazo quando ainda vale", () => {
    expect(validityLabel(proposal({ valid_until: "2026-12-31" }))).toContain("Válida até")
  })

  it("muda o texto quando venceu", () => {
    // `is_expired` vem calculado do backend — a tela não recalcula.
    const vencida = proposal({ valid_until: "2020-01-01", is_expired: true })
    expect(validityLabel(vencida)).toContain("Venceu em")
  })
})
