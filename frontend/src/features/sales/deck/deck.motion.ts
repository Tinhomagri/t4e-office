// Motion do Command Deck — GSAP.
//
// Divisão de trabalho com o framer-motion, que continua no resto do app:
//
// * framer-motion — enter/exit de elementos condicionais (AnimatePresence),
//   layout e micro-interações. Ele já está em uso e não é substituído.
// * GSAP — o que o framer-motion não faz bem: timeline de abertura encadeada,
//   stagger distribuído por grid, reveal por scroll em lote, desenho de SVG e
//   transição FLIP entre listas.
//
// Tokens ficam TODOS aqui. Nenhum número mágico de duração/easing nos decks —
// é o que impede a inconsistência que a auditoria de design pega.
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin"
import { Flip } from "gsap/Flip"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { SplitText } from "gsap/SplitText"
import { useEffect, useState } from "react"

import { MARK, sel } from "./deck.marks"

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText, DrawSVGPlugin, Flip)

export { Flip, ScrollTrigger, SplitText, gsap, useGSAP }
export { MARK } from "./deck.marks"

/** Durações do deck. Quatro valores, nada fora desta lista. */
export const DUR = {
  /** Micro-interação: hover, foco. Curto porque acontece o tempo todo. */
  micro: 0.12,
  /** Troca de estado da UI: filtro, tab, tooltip. */
  ui: 0.24,
  /** Reveal de painel ao entrar no viewport. */
  reveal: 0.42,
  /** Abertura do deck — acontece uma vez por visita, pode respirar. */
  intro: 0.6,
} as const

/** Easings nomeados. Entrada desacelera, saída acelera, scroll é linear. */
export const EASE = {
  enter: "power3.out",
  exit: "power2.in",
  move: "power2.inOut",
  scrub: "none",
} as const

/** Defasagem entre irmãos num stagger. */
export const STAGGER = {
  tight: 0.04,
  normal: 0.07,
} as const

/**
 * `prefers-reduced-motion`, reativo à troca da preferência do sistema.
 *
 * Com reduced motion ligado o deck não anima nada: cada elemento nasce no
 * estado final. Não é uma versão "mais lenta" — é a ausência de movimento.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  return reduced
}

/**
 * Coloca o deck inteiro no estado final, sem animar.
 *
 * Usado com reduced motion e como estado de segurança: qualquer elemento que
 * o JS deixaria invisível precisa voltar a visível aqui, senão a preferência
 * de acessibilidade esconderia conteúdo.
 */
export function settleDeck(scope: HTMLElement): void {
  const q = gsap.utils.selector(scope)
  const marks = [MARK.kpi, MARK.panel, MARK.title]
  const targets = marks.flatMap((m) => q(sel(m)))
  if (targets.length) gsap.set(targets, { clearProps: "all", opacity: 1, y: 0 })

  // Barras já nascem com o `scaleX` correto no style inline — limpar o
  // transform aqui as achataria. Só removemos o que a animação teria posto.
  const bars = q(sel(MARK.bar))
  if (bars.length) gsap.set(bars, { opacity: 1 })

  const arcs = q(sel(MARK.arc))
  if (arcs.length) gsap.set(arcs, { drawSVG: "100%" })
}

/**
 * Timeline de abertura do deck.
 *
 * Ordem: título → KPIs em cascata do centro → faixas do funil escalando em X.
 * Os painéis NÃO entram aqui — eles revelam por scroll (ver `revealPanels`),
 * senão o que está fora da tela anima antes de alguém ver.
 *
 * Devolve a timeline para o chamador encadear ou inspecionar.
 */
export function introTimeline(scope: HTMLElement): gsap.core.Timeline {
  const tl = gsap.timeline({ defaults: { duration: DUR.intro, ease: EASE.enter } })
  const q = gsap.utils.selector(scope)

  const titleEl = q(sel(MARK.title))[0] as HTMLElement | undefined
  if (titleEl) {
    // SplitText reverte sozinho no cleanup do useGSAP (scope revert).
    const split = new SplitText(titleEl, { type: "chars" })
    tl.from(split.chars, {
      opacity: 0,
      y: 14,
      duration: DUR.reveal,
      stagger: STAGGER.tight,
    })
  }

  const kpis = q(sel(MARK.kpi))
  if (kpis.length) {
    tl.from(
      kpis,
      {
        opacity: 0,
        y: 18,
        // Do centro para as bordas: o olho pousa no meio do grid primeiro.
        stagger: { each: STAGGER.normal, from: "center", grid: "auto" },
      },
      // Sobrepõe ao final do título em vez de esperar — a abertura inteira
      // precisa caber em ~1s, senão vira espera.
      "<0.18",
    )
  }

  const bars = q(sel(MARK.bar))
  if (bars.length) {
    tl.from(
      bars,
      {
        scaleX: 0,
        transformOrigin: "left center",
        stagger: STAGGER.normal,
        ease: EASE.enter,
      },
      "<0.1",
    )
  }

  const arcs = q(sel(MARK.arc))
  if (arcs.length) {
    tl.from(arcs, { drawSVG: "0%", duration: DUR.intro, ease: EASE.move }, "<")
  }

  return tl
}

/**
 * Revela os painéis em lote conforme entram no viewport.
 *
 * `ScrollTrigger.batch` agrupa os que cruzam o limiar na mesma leva, então o
 * stagger sai coerente mesmo com o usuário rolando rápido. `once: true` porque
 * é reveal de entrada, não efeito de scroll — reanimar ao voltar irrita.
 */
export function revealPanels(scope: HTMLElement): void {
  const panels = gsap.utils.selector(scope)(sel(MARK.panel))
  if (!panels.length) return

  gsap.set(panels, { opacity: 0, y: 24 })
  ScrollTrigger.batch(panels, {
    start: "top 88%",
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: DUR.reveal,
        ease: EASE.enter,
        stagger: STAGGER.normal,
        overwrite: true,
      }),
  })
}

/**
 * Captura o estado das linhas antes de um filtro e anima a diferença (FLIP).
 *
 * Por que FLIP aqui: no drill-down por estágio a tabela troca de conteúdo. Sem
 * animação o usuário não sabe se filtrou ou se a página recarregou. Com FLIP as
 * linhas que sobrevivem ao filtro *se movem* para a nova posição — o movimento
 * explica o que aconteceu.
 *
 * Uso: chame `flipRows` para capturar, mude o estado, e chame o retorno no
 * layout effect seguinte.
 */
export function flipRows(scope: HTMLElement): () => void {
  const rows = gsap.utils.selector(scope)(sel(MARK.row))
  const state = Flip.getState(rows)

  return () => {
    Flip.from(state, {
      duration: DUR.ui,
      ease: EASE.move,
      absolute: true,
      // Linhas que saíram do filtro somem sem encolher a zero (buraco negro).
      onLeave: (els) =>
        gsap.to(els, { opacity: 0, scale: 0.97, duration: DUR.micro, ease: EASE.exit }),
      onEnter: (els) =>
        gsap.fromTo(
          els,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: DUR.ui, ease: EASE.enter, stagger: STAGGER.tight },
        ),
    })
  }
}
