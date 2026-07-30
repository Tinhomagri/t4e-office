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

/** Drop zone da coluna "respirando" quando um card paira sobre ela.
 *
 * Usado pelo board de vendas. O Kanban deixou de usar: escalar o painel arrastava
 * junto o header e todos os cards de dentro, e só a troca de cor/borda já diz
 * "solta aqui" sem mover nada de lugar. */
export const dropZone: Variants = {
  idle: { scale: 1 },
  over: { scale: 1.008, transition: springSnappy },
}

// ─── Arrasto de card no Kanban ───────────────────────────────────────────────
// Tween em todo o gesto, nunca spring: mola sempre passa do ponto e volta, e num
// card de board isso lê como o objeto "quicando" no lugar. Também sem `rotate` —
// card inclinado parece carta de baralho, não tarefa.

/** Levantar o card no overlay: só um leve ganho de escala, em ease-out. */
export const dragLift: Transition = { duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }

/** Card entrando/saindo da coluna. Só opacidade: qualquer escala aqui competiria
 * com o voo do clone, que chega no mesmo instante. */
export const cardFade: Transition = { duration: 0.18, ease: "easeOut" }

/** Voo do clone até o slot de destino, no soltar.
 *
 * `keyframes` explícito porque o resolver default do dnd-kit monta o transform
 * do zero e descarta o que o framer tinha aplicado. Curva desacelerada e sem
 * overshoot: o card chega e para. */
export const dropFlight = {
  duration: 240,
  easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
  keyframes: ({
    transform,
  }: {
    transform: {
      initial: { x: number; y: number; scaleX: number; scaleY: number }
      final: { x: number; y: number; scaleX: number; scaleY: number }
    }
  }) => [
    {
      transform: `translate3d(${transform.initial.x}px, ${transform.initial.y}px, 0) scale(${transform.initial.scaleX}, ${transform.initial.scaleY})`,
    },
    {
      transform: `translate3d(${transform.final.x}px, ${transform.final.y}px, 0) scale(${transform.final.scaleX}, ${transform.final.scaleY})`,
    },
  ],
}
