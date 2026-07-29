import { Suspense, lazy } from "react"

// O runtime do Spline pesa ~2MB e a cena vem da CDN deles: fica fora do bundle
// inicial e só entra quando o painel decorativo realmente renderiza.
const Spline = lazy(() => import("@splinetool/react-spline"))

interface SplineSceneProps {
  /** URL do .splinecode publicado. */
  scene: string
  className?: string
  /** Descrição para leitores de tela; a cena é enfeite, então o padrão é ocultar. */
  ariaLabel?: string
}

export function SplineScene({ scene, className, ariaLabel }: SplineSceneProps) {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden
          className="flex h-full w-full items-center justify-center"
        >
          <span className="size-8 animate-spin rounded-full border-2 border-paper/20 border-t-paper/70" />
        </div>
      }
    >
      <div
        className="h-full w-full"
        aria-hidden={ariaLabel ? undefined : true}
        aria-label={ariaLabel}
        role={ariaLabel ? "img" : undefined}
      >
        <Spline scene={scene} className={className} />
      </div>
    </Suspense>
  )
}
