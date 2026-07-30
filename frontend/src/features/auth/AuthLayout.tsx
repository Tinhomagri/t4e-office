import { motion } from "framer-motion"
import { type ReactNode } from "react"

import { EASE } from "@/shared/lib/motion"
import { DecorBoundary } from "@/shared/ui/DecorBoundary"
import { SplineScene } from "@/shared/ui/SplineScene"
import { Spotlight } from "@/shared/ui/Spotlight"

// Cena Spline (robô que acompanha o ponteiro). O runtime é lazy dentro do
// próprio SplineScene, então nada disso entra no bundle inicial.
const ROBOT_SCENE = "https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
}

// Tela dividida ao meio:
// esquerda = fundo preto com a animação 3D rolando + branding;
// direita = fundo branco com o formulário em destaque (texto escuro).
export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Metade esquerda: preto + animação */}
      <div className="relative hidden overflow-hidden bg-ink md:block md:w-1/2">
        {/* A cena é enfeite: se o WebGL faltar ou uma textura não carregar, o
            login precisa continuar de pé. Sem este boundary um 404 de textura
            derruba a tela inteira. */}
        <div className="absolute inset-0">
          <DecorBoundary>
            {/* Halo que segue o cursor. Precisa ser irmão da cena e filho
                direto do painel: ele promove o pai a relative/overflow-hidden. */}
            <Spotlight className="-top-32 left-0 md:-top-16 md:left-24" size={380} />
            {/* Reduz e sobe o robô: em escala 1 ele invade o canto inferior
                esquerdo, onde mora a headline. */}
            <div className="h-full w-full origin-center -translate-y-[6%] scale-[0.72]">
              <SplineScene scene={ROBOT_SCENE} className="h-full w-full" />
            </div>
          </DecorBoundary>
        </div>

        {/* Vinheta: escurece bordas e, principalmente, a base — é ali que o
            branding fica sobre o robô. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(110% 80% at 55% 38%, transparent 30%, rgba(10,11,13,0.72) 100%), linear-gradient(to top, rgba(10,11,13,0.92) 4%, transparent 42%)",
          }}
        />

        {/* Branding sobreposto. `pointer-events-none` é essencial: este bloco
            cobre o painel inteiro e, sem isso, engole o cursor antes que ele
            chegue nas partículas. */}
        <div className="pointer-events-none relative z-10 flex h-full flex-col p-12">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md border border-paper/30 bg-paper/5 backdrop-blur" />
            <span className="text-sm font-semibold tracking-[0.3em] text-paper-300">
              T4E OFFICE
            </span>
          </div>
          {/* `mt-auto` empurra o texto para a base: o glifo fica com todo o
              espaço acima e o painel deixa de ter um vão morto no rodapé. */}
          <motion.div
            className="mt-auto max-w-md"
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } } }}
          >
            <motion.h2
              variants={{
                hidden: { opacity: 0, y: 16 },
                show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
              }}
              className="text-[42px] font-extrabold leading-[1.08] tracking-[-0.02em] text-paper"
            >
              O trabalho e a equipe{" "}
              <span className="text-shimmer animate-shimmer">no mesmo espaço.</span>
            </motion.h2>
            <motion.p
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
              }}
              className="mt-5 max-w-sm text-[15px] leading-relaxed text-paper-400"
            >
              Gestão de projetos com presença real e uma camada de inteligência
              que reduz o trabalho sobre o trabalho.
            </motion.p>
          </motion.div>
          <span className="mt-10 text-xs text-paper-500">© T4E Group</span>
        </div>
      </div>

      {/* Metade direita: branco + formulário */}
      <div className="relative flex w-full items-center justify-center bg-paper dark:bg-ink-900 px-6 py-10 sm:px-12 md:w-1/2">
        {/* Logo no topo */}
        <div className="absolute left-8 top-8 flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-ink text-xs font-bold text-paper">
            T4
          </div>
          <span className="text-sm font-semibold tracking-[0.25em] text-ink dark:text-paper">
            T4E OFFICE
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[400px]"
        >
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink dark:text-paper">
            {title}
          </h1>
          <p className="mt-2 text-[15px] text-paper-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </motion.div>

        {/* Rodapé legal */}
        <p className="absolute bottom-6 text-xs text-paper-400">
          © T4E Group · Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}
