import type { Transition, Variants } from "framer-motion"

// ─────────────────────────────────────────────────────────────────────────────
// Camada de movimento reutilizável do sistema. Uma fonte única de easing/springs
// e variantes de entrada, para que login, shell e features animem com a mesma
// "assinatura". Baseado em motion-principles: entrada = ease-out/spring, saída
// mais sutil, nada acima de 500ms em UI, transform/opacity apenas.
// ─────────────────────────────────────────────────────────────────────────────

/** Curva-assinatura do sistema (fast-out, smooth-land). */
export const EASE = [0.16, 1, 0.3, 1] as const

/** Spring padrão para hover/tap/foco — tátil, sem overshoot exagerado. */
export const springSnappy: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
}

/** Spring suave para transições maiores (painéis, reveals). */
export const springSmooth: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 32,
}

/** Container com stagger — orquestra a entrada dos filhos em cascata. */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.15 },
  },
}

/** Item de entrada: sobe + fade (entra com ease-out via spring). */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: springSmooth },
}

/** Reveal/colapso de mensagem (ex.: erro de formulário). Saída mais sutil. */
export const revealCollapse: Variants = {
  hidden: { opacity: 0, height: 0 },
  show: {
    opacity: 1,
    height: "auto",
    transition: { duration: 0.28, ease: EASE },
  },
  exit: { opacity: 0, height: 0, transition: { duration: 0.18, ease: "easeIn" } },
}

/** Micro-interação padrão de elementos clicáveis (botão, chip, card). */
export const pressable = {
  whileHover: { scale: 1.015 },
  whileTap: { scale: 0.985 },
  transition: springSnappy,
} as const

// ─── Táteis (board tipo Jira) ────────────────────────────────────────────────

/** Spring de "assentamento" — objeto pesado que cai e acomoda (leve overshoot). */
export const settleSpring: Transition = {
  type: "spring",
  stiffness: 600,
  damping: 34,
  mass: 0.9,
}

/** Card sendo levantado no DragOverlay: sobe, inclina e cresce um tico. */
export const liftCard: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 30,
}

/** Pop físico de confirmação (checkbox concluir): comprime e volta com overshoot. */
export const popCheck: Variants = {
  idle: { scale: 1 },
  done: {
    scale: [1, 0.82, 1.12, 1],
    transition: { duration: 0.34, ease: EASE, times: [0, 0.25, 0.6, 1] },
  },
}

/** Drop zone da coluna "respirando" quando um card paira sobre ela. */
export const dropZone: Variants = {
  idle: { scale: 1 },
  over: { scale: 1.008, transition: springSnappy },
}
