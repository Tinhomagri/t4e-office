import { motion, useSpring, useTransform, type SpringOptions } from "framer-motion"
import { useCallback, useEffect, useRef, useState } from "react"

import { cn } from "@/shared/lib/cn"

interface SpotlightProps {
  className?: string
  /** Diâmetro do halo em px. */
  size?: number
  springOptions?: SpringOptions
}

/**
 * Halo radial que segue o ponteiro dentro do elemento pai.
 *
 * Anima só `left`/`top` via MotionValue (fora do ciclo de render do React) e
 * `opacity` na entrada/saída — nada de layout property. O pai vira
 * `relative`/`overflow-hidden` automaticamente para o halo não vazar.
 */
export function Spotlight({
  className,
  size = 320,
  springOptions = { bounce: 0 },
}: SpotlightProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [parentElement, setParentElement] = useState<HTMLElement | null>(null)

  const mouseX = useSpring(0, springOptions)
  const mouseY = useSpring(0, springOptions)

  const spotlightLeft = useTransform(mouseX, (x) => `${x - size / 2}px`)
  const spotlightTop = useTransform(mouseY, (y) => `${y - size / 2}px`)

  useEffect(() => {
    const parent = containerRef.current?.parentElement
    if (!parent) return
    // Só promove se o pai for `static`. Sobrescrever cegamente com `relative`
    // quebra pais que já são `absolute`/`fixed` — eles caem no fluxo normal e
    // arrastam o layout inteiro junto.
    if (getComputedStyle(parent).position === "static") {
      parent.style.position = "relative"
    }
    parent.style.overflow = "hidden"
    setParentElement(parent)
  }, [])

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!parentElement) return
      const { left, top } = parentElement.getBoundingClientRect()
      mouseX.set(event.clientX - left)
      mouseY.set(event.clientY - top)
    },
    [mouseX, mouseY, parentElement],
  )

  useEffect(() => {
    if (!parentElement) return
    // Referências nomeadas: com arrow inline o removeEventListener não casa e
    // os handlers vazam a cada re-render.
    const onEnter = () => setIsHovered(true)
    const onLeave = () => setIsHovered(false)

    parentElement.addEventListener("mousemove", handleMouseMove)
    parentElement.addEventListener("mouseenter", onEnter)
    parentElement.addEventListener("mouseleave", onLeave)

    return () => {
      parentElement.removeEventListener("mousemove", handleMouseMove)
      parentElement.removeEventListener("mouseenter", onEnter)
      parentElement.removeEventListener("mouseleave", onLeave)
    }
  }, [parentElement, handleMouseMove])

  return (
    <motion.div
      ref={containerRef}
      aria-hidden
      className={cn(
        "pointer-events-none absolute rounded-full bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops),transparent_80%)] blur-3xl transition-opacity duration-300",
        "from-white/25 via-white/10 to-transparent",
        isHovered ? "opacity-100" : "opacity-0",
        className,
      )}
      style={{
        width: size,
        height: size,
        left: spotlightLeft,
        top: spotlightTop,
      }}
    />
  )
}
