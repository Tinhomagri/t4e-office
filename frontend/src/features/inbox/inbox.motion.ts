// Camada de movimento do Atendimento.
//
// Doutrina: o agente encara esta tela oito horas por dia. Animação que encanta
// na primeira vez cansa na centésima — então tudo aqui é curto, funcional e
// sem overshoot em ação repetida. Bounce só no badge de não-lidas, que é
// evento raro e precisa puxar o olho.
//
// Reaproveita `EASE` do sistema (shared/lib/motion) para o atendimento ter a
// mesma assinatura do resto do app.
import type { Transition, Variants } from "framer-motion"

import { EASE } from "@/shared/lib/motion"

/** Durações em segundos, na escala de motion-principles. */
export const DUR = {
  /** Hover, foco, troca de aba — feedback que precisa ser imperceptível. */
  micro: 0.12,
  /** Entrada de mensagem, painel, sugestões. */
  ui: 0.2,
  /** Saída: sempre mais curta que a entrada. */
  exit: 0.14,
} as const

/** Deslocamento de entrada. 8px basta para dar direção sem virar salto. */
const RISE = 8

export const easeOut: Transition = { duration: DUR.ui, ease: EASE }
export const easeExit: Transition = { duration: DUR.exit, ease: "easeIn" }

/**
 * Lista de conversas: o container escalona os filhos ao trocar de filtro.
 * O stagger é curto (30ms) e a própria lista corta em 8 itens — cascatear 50
 * conversas faria a última entrar meio segundo depois da primeira.
 */
export const listContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03 } },
}

export const listItem: Variants = {
  hidden: { opacity: 0, y: RISE },
  show: { opacity: 1, y: 0, transition: easeOut },
}

/** Quantos itens recebem stagger antes de a lista aparecer de uma vez. */
export const STAGGER_CAP = 8

/**
 * Mensagem entrando na thread. Sobe 8px e aparece; a saída é só opacidade —
 * mensagem apagada não precisa de coreografia.
 */
export const messageIn: Variants = {
  hidden: { opacity: 0, y: RISE },
  show: { opacity: 1, y: 0, transition: easeOut },
  exit: { opacity: 0, transition: easeExit },
}

/**
 * Badge de não-lidas: o único spring com overshoot da tela. É evento raro
 * (mensagem nova chegando) e o pop é justamente o que chama atenção.
 */
export const badgePop: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 22,
}

/** Painel do contato deslizando ao abrir uma conversa. */
export const panelIn: Variants = {
  hidden: { opacity: 0, x: 12 },
  show: { opacity: 1, x: 0, transition: easeOut },
  exit: { opacity: 0, transition: easeExit },
}

/** Popover de respostas prontas — encosta no composer, então sobe de baixo. */
export const popoverIn: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: DUR.micro, ease: EASE } },
  exit: { opacity: 0, scale: 0.98, transition: easeExit },
}

/** Chip de etiqueta entrando/saindo. Nunca escala a 0 — some em 0.9 + fade. */
export const chipIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: { duration: DUR.micro, ease: EASE } },
  exit: { opacity: 0, scale: 0.9, transition: easeExit },
}

/**
 * Devolve variantes neutras quando o usuário pediu menos movimento.
 * Mantém opacidade (a mudança de estado ainda precisa ser perceptível) e
 * descarta translação e escala, que são as que causam desconforto.
 */
export function respectMotion(variants: Variants, reduced: boolean | null): Variants {
  if (!reduced) return variants
  return {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.01 } },
    exit: { opacity: 0, transition: { duration: 0.01 } },
  }
}
