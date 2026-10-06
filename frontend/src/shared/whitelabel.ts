// Aplicação do whitelabel no documento e a fonte de verdade do que está ativo.
//
// A escolha vive em dois lugares de propósito:
//
//  - `localStorage`, lido ANTES do primeiro render (ver `bootWhitelabel`). É o
//    que evita a tela aparecer com a cor de fábrica e trocar meio segundo
//    depois, quando o perfil chega da API.
//  - no perfil do usuário, para a marca acompanhar a pessoa em outro
//    computador. O perfil é a verdade; o storage é só o cache rápido.

import { create } from "zustand"

import {
  COLOR_TOKENS,
  FONT_TOKENS,
  RADIUS_TOKENS,
  colorCssVar,
  hexToChannels,
} from "./whitelabel.tokens"

export type Whitelabel = {
  /** Token → cor hexadecimal. Só os tokens alterados entram aqui. */
  colors: Record<string, string>
  /** Chave do FONT_TOKENS → pilha CSS. */
  fonts: Record<string, string>
  /** Chave do RADIUS_TOKENS → medida CSS. */
  radius: Record<string, string>
  /** Nome exibido no canto superior esquerdo e no título da aba. */
  appName: string
  /** Sigla do quadradinho da marca, quando não há logotipo. */
  appInitials: string
  /** Data URI ou URL de um logotipo que substitui o quadradinho. */
  logoUrl: string
}

export const EMPTY_WHITELABEL: Whitelabel = {
  colors: {},
  fonts: {},
  radius: {},
  appName: "",
  appInitials: "",
  logoUrl: "",
}

const STORAGE_KEY = "t4e.whitelabel"
const COLOR_KEYS = new Set(COLOR_TOKENS.map((t) => t.key))
const FONT_KEYS = new Set(FONT_TOKENS.map((t) => t.key))
const RADIUS_KEYS = new Set(RADIUS_TOKENS.map((t) => t.key))

/**
 * Peneira o que veio do servidor ou do storage.
 *
 * O valor é texto livre que acaba dentro de uma propriedade CSS, então chave
 * desconhecida é descartada e `;`/`{`/`}` também: sem isso, um valor de fonte
 * salvo com `;` fecharia a declaração e injetaria regras arbitrárias no
 * documento de quem abrisse o perfil.
 */
export function sanitizeWhitelabel(input: unknown): Whitelabel {
  const raw = (input ?? {}) as Partial<Record<keyof Whitelabel, unknown>>
  const out: Whitelabel = { ...EMPTY_WHITELABEL, colors: {}, fonts: {}, radius: {} }

  const colors = raw.colors
  if (colors && typeof colors === "object") {
    for (const [key, value] of Object.entries(colors as Record<string, unknown>)) {
      if (!COLOR_KEYS.has(key) || typeof value !== "string") continue
      if (hexToChannels(value)) out.colors[key] = value.trim()
    }
  }

  const copyText = (
    source: unknown,
    allowed: Set<string>,
    target: Record<string, string>,
  ) => {
    if (!source || typeof source !== "object") return
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (!allowed.has(key) || typeof value !== "string") continue
      const clean = value.trim().slice(0, 200)
      if (!clean || /[;{}<>]/.test(clean)) continue
      target[key] = clean
    }
  }
  copyText(raw.fonts, FONT_KEYS, out.fonts)
  copyText(raw.radius, RADIUS_KEYS, out.radius)

  if (typeof raw.appName === "string") out.appName = raw.appName.trim().slice(0, 40)
  if (typeof raw.appInitials === "string") out.appInitials = raw.appInitials.trim().slice(0, 4)
  // Só imagem embutida ou http(s): `javascript:` num src de <img> não executa,
  // mas o campo também alimenta o favicon e não vale correr o risco.
  if (typeof raw.logoUrl === "string") {
    const url = raw.logoUrl.trim()
    if (/^(data:image\/|https?:\/\/)/.test(url)) out.logoUrl = url.slice(0, 500_000)
  }
  return out
}

export function isWhitelabelEmpty(wl: Whitelabel): boolean {
  return (
    Object.keys(wl.colors).length === 0 &&
    Object.keys(wl.fonts).length === 0 &&
    Object.keys(wl.radius).length === 0 &&
    !wl.appName &&
    !wl.appInitials &&
    !wl.logoUrl
  )
}

/**
 * Escreve as variáveis no `<html>`.
 *
 * Só o que foi personalizado vira variável: o resto continua caindo no
 * fallback que o Tailwind compilou, então remover um token devolve a cor
 * original sem precisar saber qual era.
 */
export function applyWhitelabel(wl: Whitelabel): void {
  const root = document.documentElement
  for (const token of COLOR_TOKENS) {
    const channels = wl.colors[token.key] ? hexToChannels(wl.colors[token.key]) : null
    if (channels) root.style.setProperty(colorCssVar(token.key), channels)
    else root.style.removeProperty(colorCssVar(token.key))
  }
  const applyText = (tokens: typeof FONT_TOKENS, chosen: Record<string, string>) => {
    for (const token of tokens) {
      const value = chosen[token.key]
      if (value) root.style.setProperty(token.cssVar, value)
      else root.style.removeProperty(token.cssVar)
    }
  }
  applyText(FONT_TOKENS, wl.fonts)
  applyText(RADIUS_TOKENS, wl.radius)
  if (wl.appName) document.title = wl.appName
}

function readStorage(): Whitelabel {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? sanitizeWhitelabel(JSON.parse(raw)) : EMPTY_WHITELABEL
  } catch {
    return EMPTY_WHITELABEL
  }
}

function writeStorage(wl: Whitelabel): void {
  try {
    if (isWhitelabelEmpty(wl)) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(wl))
  } catch {
    // Storage bloqueado: a marca vale para esta aba e volta pelo perfil.
  }
}

type WhitelabelState = {
  whitelabel: Whitelabel
  /** Marca em edição na tela de Perfil — pré-visualizada sem ter sido salva. */
  preview: Whitelabel | null
  setWhitelabel: (wl: Whitelabel) => void
  setPreview: (wl: Whitelabel | null) => void
}

export const useWhitelabelStore = create<WhitelabelState>((set) => ({
  whitelabel: readStorage(),
  preview: null,
  setWhitelabel: (wl) => {
    const clean = sanitizeWhitelabel(wl)
    writeStorage(clean)
    set((state) => {
      // Com a tela de edição aberta, quem manda na tela é o rascunho.
      if (!state.preview) applyWhitelabel(clean)
      return { whitelabel: clean }
    })
  },
  setPreview: (wl) => {
    set((state) => {
      applyWhitelabel(wl ? sanitizeWhitelabel(wl) : state.whitelabel)
      return { preview: wl }
    })
  },
}))

/** Chamado uma vez na subida do app, antes de qualquer render. */
export function bootWhitelabel(): void {
  applyWhitelabel(useWhitelabelStore.getState().whitelabel)
}
