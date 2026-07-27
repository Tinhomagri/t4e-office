import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

// jsdom não implementa matchMedia; GSAP ScrollTrigger chama isso no import
// (deck.motion.ts) e quebra qualquer teste que carregue esse módulo.
window.matchMedia = window.matchMedia || ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}))

// Desmonta a árvore React entre testes para evitar vazamento de estado no DOM.
afterEach(() => cleanup())
