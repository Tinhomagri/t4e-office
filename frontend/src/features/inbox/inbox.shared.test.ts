import { describe, expect, it } from "vitest"

import {
  cannedResponseQuery,
  cleanFilters,
  contactDisplayName,
  conversationPreview,
  dayLabel,
  groupMessagesByDay,
  initials,
  isSendShortcut,
  matchCannedResponses,
  messageTime,
  priorityLabel,
  relativeTime,
  shouldGroupWithPrevious,
  sortConversations,
  sortMessages,
} from "./inbox.shared"
import type { CannedResponse, Conversation, Message } from "./inbox.types"

// ── Fábricas de fixture ──────────────────────────────────────────────────────
function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 1,
    conversation_id: 1,
    content: "oi",
    message_type: 0,
    direction: "incoming",
    content_type: "text",
    content_attributes: {},
    private: false,
    status: "sent",
    created_at: "2026-07-27T10:00:00Z",
    sender: { id: 5, name: "Ana", kind: "contact", avatar_url: "", email: "" },
    attachments: [],
    ...overrides,
  }
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 1,
    uuid: "u",
    inbox_id: 1,
    status: "open",
    priority: null,
    labels: [],
    custom_attributes: {},
    additional_attributes: {},
    unread_count: 0,
    can_reply: true,
    muted: false,
    snoozed_until: null,
    created_at: "2026-07-27T09:00:00Z",
    last_activity_at: "2026-07-27T10:00:00Z",
    waiting_since: null,
    channel: "Channel::WebWidget",
    contact: {
      id: 5,
      name: "Ana Souza",
      email: "ana@x.com",
      phone_number: "",
      identifier: "",
      avatar_url: "",
      additional_attributes: {},
      custom_attributes: {},
    },
    assignee: null,
    team: null,
    last_message: makeMessage(),
    messages: [],
    link: {},
    ...overrides,
  }
}

// ── Tempo ────────────────────────────────────────────────────────────────────
describe("relativeTime", () => {
  const now = new Date("2026-07-27T12:00:00Z")

  it("mostra 'agora' abaixo de um minuto", () => {
    expect(relativeTime("2026-07-27T11:59:30Z", now)).toBe("agora")
  })

  it("mostra minutos, horas e dias na escala certa", () => {
    expect(relativeTime("2026-07-27T11:55:00Z", now)).toBe("5m")
    expect(relativeTime("2026-07-27T09:00:00Z", now)).toBe("3h")
    expect(relativeTime("2026-07-25T12:00:00Z", now)).toBe("2d")
  })

  it("acima de uma semana vira data curta", () => {
    // "há 43d" não ajuda: o Chatwoot troca por dd/mm nesse ponto.
    expect(relativeTime("2026-06-01T12:00:00Z", now)).toMatch(/\d{2}\/\d{2}/)
  })

  it("devolve vazio para data ausente ou inválida", () => {
    expect(relativeTime(null, now)).toBe("")
    expect(relativeTime("não é data", now)).toBe("")
  })
})

describe("messageTime", () => {
  it("formata em 24h sem segundos", () => {
    expect(messageTime("2026-07-27T14:35:09Z")).toMatch(/^\d{2}:\d{2}$/)
  })

  it("ignora entrada inválida", () => {
    expect(messageTime(null)).toBe("")
    expect(messageTime("xyz")).toBe("")
  })
})

describe("dayLabel", () => {
  const now = new Date("2026-07-27T12:00:00Z")

  it("chama o dia corrente de Hoje e o anterior de Ontem", () => {
    expect(dayLabel("2026-07-27T08:00:00Z", now)).toBe("Hoje")
    expect(dayLabel("2026-07-26T23:00:00Z", now)).toBe("Ontem")
  })

  it("datas mais antigas viram data por extenso", () => {
    expect(dayLabel("2026-07-20T10:00:00Z", now)).toContain("2026")
  })
})

// ── Lista ────────────────────────────────────────────────────────────────────
describe("conversationPreview", () => {
  it("usa o conteúdo da última mensagem", () => {
    expect(conversationPreview(makeConversation())).toBe("oi")
  })

  it("descreve o anexo quando não há texto", () => {
    const withImage = makeConversation({
      last_message: makeMessage({
        content: "  ",
        attachments: [
          { id: 1, file_type: "image", data_url: "u", thumb_url: "", file_size: 1 },
        ],
      }),
    })
    expect(conversationPreview(withImage)).toBe("📷 Imagem")
  })

  it("distingue áudio, vídeo e arquivo genérico", () => {
    const kinds = [
      ["audio", "🎤 Áudio"],
      ["video", "🎬 Vídeo"],
      ["file", "📎 Anexo"],
    ] as const
    for (const [fileType, expected] of kinds) {
      const conv = makeConversation({
        last_message: makeMessage({
          content: "",
          attachments: [{ id: 1, file_type: fileType, data_url: "u", thumb_url: "", file_size: 1 }],
        }),
      })
      expect(conversationPreview(conv)).toBe(expected)
    }
  })

  it("avisa quando a conversa não tem mensagem", () => {
    expect(conversationPreview(makeConversation({ last_message: null }))).toBe("Sem mensagens")
  })
})

describe("contactDisplayName", () => {
  it("prefere o nome do contato", () => {
    expect(contactDisplayName(makeConversation())).toBe("Ana Souza")
  })

  it("cai para e-mail e depois telefone", () => {
    const semNome = makeConversation({
      contact: {
        id: 1,
        name: "  ",
        email: "x@y.com",
        phone_number: "+5551999",
        identifier: "",
        avatar_url: "",
        additional_attributes: {},
        custom_attributes: {},
      },
    })
    expect(contactDisplayName(semNome)).toBe("x@y.com")

    const soTelefone = makeConversation({
      contact: {
        id: 1,
        name: "",
        email: "",
        phone_number: "+5551999",
        identifier: "",
        avatar_url: "",
        additional_attributes: {},
        custom_attributes: {},
      },
    })
    expect(contactDisplayName(soTelefone)).toBe("+5551999")
  })

  it("lida com conversa sem contato", () => {
    expect(contactDisplayName(makeConversation({ contact: null }))).toBe("Sem contato")
  })
})

describe("initials", () => {
  it("usa primeira e última palavra", () => {
    expect(initials("Ana Souza")).toBe("AS")
    expect(initials("Ana Maria de Souza")).toBe("AS")
  })

  it("com uma palavra usa as duas primeiras letras", () => {
    expect(initials("Ana")).toBe("AN")
  })

  it("sem nome devolve interrogação", () => {
    expect(initials("   ")).toBe("?")
  })
})

describe("sortConversations", () => {
  it("coloca não lidas na frente, mesmo sendo mais antigas", () => {
    const antigaNaoLida = makeConversation({
      id: 1,
      unread_count: 3,
      last_activity_at: "2026-07-20T10:00:00Z",
    })
    const recenteLida = makeConversation({
      id: 2,
      unread_count: 0,
      last_activity_at: "2026-07-27T10:00:00Z",
    })
    const ordenada = sortConversations([recenteLida, antigaNaoLida])
    expect(ordenada.map((c) => c.id)).toEqual([1, 2])
  })

  it("entre iguais, ordena pela atividade mais recente", () => {
    const a = makeConversation({ id: 1, last_activity_at: "2026-07-25T10:00:00Z" })
    const b = makeConversation({ id: 2, last_activity_at: "2026-07-27T10:00:00Z" })
    expect(sortConversations([a, b]).map((c) => c.id)).toEqual([2, 1])
  })

  it("não muta o array original", () => {
    const lista = [makeConversation({ id: 1 }), makeConversation({ id: 2, unread_count: 1 })]
    sortConversations(lista)
    expect(lista.map((c) => c.id)).toEqual([1, 2])
  })
})

// ── Thread ───────────────────────────────────────────────────────────────────
describe("shouldGroupWithPrevious", () => {
  const base = makeMessage({ created_at: "2026-07-27T10:00:00Z" })

  it("agrupa mensagens seguidas do mesmo autor dentro de 2 minutos", () => {
    const seguinte = makeMessage({ id: 2, created_at: "2026-07-27T10:01:00Z" })
    expect(shouldGroupWithPrevious(seguinte, base)).toBe(true)
  })

  it("não agrupa depois da janela de 2 minutos", () => {
    const tarde = makeMessage({ id: 2, created_at: "2026-07-27T10:05:00Z" })
    expect(shouldGroupWithPrevious(tarde, base)).toBe(false)
  })

  it("não agrupa autores diferentes", () => {
    const outro = makeMessage({
      id: 2,
      created_at: "2026-07-27T10:00:30Z",
      sender: { id: 99, name: "Bia", kind: "user", avatar_url: "", email: "" },
    })
    expect(shouldGroupWithPrevious(outro, base)).toBe(false)
  })

  it("não agrupa sentidos diferentes", () => {
    const resposta = makeMessage({
      id: 2,
      created_at: "2026-07-27T10:00:30Z",
      direction: "outgoing",
    })
    expect(shouldGroupWithPrevious(resposta, base)).toBe(false)
  })

  it("nunca junta nota interna com mensagem pública", () => {
    const publica = makeMessage({ direction: "outgoing", created_at: "2026-07-27T10:00:00Z" })
    const nota = makeMessage({
      id: 2,
      direction: "outgoing",
      private: true,
      created_at: "2026-07-27T10:00:30Z",
    })
    expect(shouldGroupWithPrevious(nota, publica)).toBe(false)
  })

  it("evento de sistema nunca agrupa", () => {
    const atividade = makeMessage({ id: 2, direction: "activity", created_at: "2026-07-27T10:00:30Z" })
    expect(shouldGroupWithPrevious(atividade, base)).toBe(false)
    expect(shouldGroupWithPrevious(base, atividade)).toBe(false)
  })

  it("primeira mensagem da thread nunca agrupa", () => {
    expect(shouldGroupWithPrevious(base, null)).toBe(false)
  })
})

describe("groupMessagesByDay", () => {
  const now = new Date("2026-07-27T12:00:00Z")

  it("separa por dia mantendo a ordem", () => {
    const grupos = groupMessagesByDay(
      [
        makeMessage({ id: 1, created_at: "2026-07-26T10:00:00Z" }),
        makeMessage({ id: 2, created_at: "2026-07-26T11:00:00Z" }),
        makeMessage({ id: 3, created_at: "2026-07-27T09:00:00Z" }),
      ],
      now,
    )
    expect(grupos).toHaveLength(2)
    expect(grupos[0].messages.map((m) => m.id)).toEqual([1, 2])
    expect(grupos[1].messages.map((m) => m.id)).toEqual([3])
    expect(grupos[1].label).toBe("Hoje")
  })

  it("descarta mensagem sem data em vez de criar grupo fantasma", () => {
    const grupos = groupMessagesByDay([makeMessage({ created_at: null })], now)
    expect(grupos).toEqual([])
  })

  it("lista vazia devolve nenhum grupo", () => {
    expect(groupMessagesByDay([], now)).toEqual([])
  })
})

describe("sortMessages", () => {
  it("ordena por data e desempata pelo id", () => {
    const ordenada = sortMessages([
      makeMessage({ id: 3, created_at: "2026-07-27T10:02:00Z" }),
      makeMessage({ id: 2, created_at: "2026-07-27T10:00:00Z" }),
      makeMessage({ id: 1, created_at: "2026-07-27T10:00:00Z" }),
    ])
    expect(ordenada.map((m) => m.id)).toEqual([1, 2, 3])
  })
})

// ── Composer ─────────────────────────────────────────────────────────────────
describe("cannedResponseQuery", () => {
  it("dispara com barra no início", () => {
    expect(cannedResponseQuery("/ola")).toBe("ola")
    expect(cannedResponseQuery("/")).toBe("")
  })

  it("para de sugerir depois do espaço", () => {
    expect(cannedResponseQuery("/ola mundo")).toBeNull()
  })

  it("ignora texto que não começa com barra", () => {
    expect(cannedResponseQuery("bom dia")).toBeNull()
  })
})

describe("matchCannedResponses", () => {
  const responses: CannedResponse[] = [
    { id: 1, short_code: "ola", content: "Olá, tudo bem?" },
    { id: 2, short_code: "prazo", content: "O prazo de entrega é de 5 dias." },
    { id: 3, short_code: "tchau", content: "Obrigado pelo contato!" },
  ]

  it("busca por atalho", () => {
    expect(matchCannedResponses(responses, "ola").map((r) => r.id)).toEqual([1])
  })

  it("também busca no conteúdo", () => {
    expect(matchCannedResponses(responses, "entrega").map((r) => r.id)).toEqual([2])
  })

  it("query vazia devolve as primeiras opções", () => {
    expect(matchCannedResponses(responses, "")).toHaveLength(3)
  })

  it("sem correspondência devolve lista vazia", () => {
    expect(matchCannedResponses(responses, "zzz")).toEqual([])
  })
})

describe("isSendShortcut", () => {
  it("Enter envia", () => {
    expect(isSendShortcut({ key: "Enter", shiftKey: false })).toBe(true)
  })

  it("Shift+Enter quebra linha em vez de enviar", () => {
    expect(isSendShortcut({ key: "Enter", shiftKey: true })).toBe(false)
  })

  it("outras teclas não enviam", () => {
    expect(isSendShortcut({ key: "a", shiftKey: false })).toBe(false)
  })
})

// ── Filtros ──────────────────────────────────────────────────────────────────
describe("cleanFilters", () => {
  it("remove vazios, nulos e listas vazias", () => {
    expect(
      cleanFilters({ status: "open", q: "", inbox_id: undefined, labels: [], page: 1 }),
    ).toEqual({ status: "open", page: 1 })
  })

  it("mantém zero e false — são valores legítimos", () => {
    expect(cleanFilters({ page: 0, muted: false })).toEqual({ page: 0, muted: false })
  })
})

describe("priorityLabel", () => {
  it("traduz a prioridade e aceita ausência", () => {
    expect(priorityLabel("urgent")).toBe("Urgente")
    expect(priorityLabel(null)).toBe("")
  })
})
