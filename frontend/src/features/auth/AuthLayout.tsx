import { motion } from "framer-motion"
import { Suspense, lazy, type ReactNode } from "react"

// Cena 3D carregada sob demanda: Three.js fica fora do bundle inicial das telas.
const Scene = lazy(() =>
  import("@/three/Scene").then((m) => ({ default: m.Scene })),
)

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
        <div className="absolute inset-0">
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </div>

        {/* Grade tracejada animada, reforça o tom técnico/P&B */}
        <div
          className="pointer-events-none absolute inset-0 animate-grid-pan opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Branding sobreposto */}
        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md border border-paper/30 bg-paper/5 backdrop-blur" />
            <span className="text-sm font-semibold tracking-[0.3em] text-paper-300">
              T4E OFFICE
            </span>
          </div>
          <div className="max-w-md">
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="text-4xl font-extrabold leading-tight text-paper"
            >
              O trabalho e a equipe{" "}
              <span className="text-shimmer animate-shimmer">no mesmo espaço.</span>
            </motion.h2>
            <p className="mt-4 text-sm leading-relaxed text-paper-400">
              Gestão de projetos com presença real e uma camada de inteligência
              que reduz o trabalho sobre o trabalho.
            </p>
          </div>
          <span className="text-xs text-paper-500">© T4E Group</span>
        </div>
      </div>

      {/* Metade direita: branco + formulário */}
      <div className="relative flex w-full items-center justify-center bg-paper px-6 py-10 sm:px-12 md:w-1/2">
        {/* Logo no topo */}
        <div className="absolute left-8 top-8 flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-ink text-xs font-bold text-paper">
            T4
          </div>
          <span className="text-sm font-semibold tracking-[0.25em] text-ink">
            T4E OFFICE
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[400px]"
        >
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">
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
