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

// jsdom não implementa ResizeObserver; quem mede o próprio tamanho (painel do
// PC, canvas do escritório) usa isso no efeito de montagem. Stub inerte: em
// jsdom todo elemento tem tamanho 0, então observar de verdade não diria nada.
globalThis.ResizeObserver =
  globalThis.ResizeObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

// jsdom não implementa canvas 2D por padrão; mock para permitir testes de pixel art.
HTMLCanvasElement.prototype.getContext = function(contextType: string) {
  if (contextType === "2d") {
    return {
      imageSmoothingEnabled: true,
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      fillRect: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      closePath: () => {},
      arc: () => {},
      quadraticCurveTo: () => {},
      // Móveis isométricos colam cada face torta via transform+drawImage
      // (`isoProps.ts`/`isoBake.ts`) — precisa desse trio a mais.
      save: () => {},
      restore: () => {},
      clip: () => {},
      setTransform: () => {},
      drawImage: () => {},
    } as any
  }
  return null
}

// Desmonta a árvore React entre testes para evitar vazamento de estado no DOM.
afterEach(() => cleanup())
