import { motion } from "framer-motion"
import { type ReactNode } from "react"
import { Link } from "react-router-dom"

import { AuthCarousel } from "@/features/auth/AuthCarousel"
import { EASE } from "@/shared/lib/motion"
import { DecorBoundary } from "@/shared/ui/DecorBoundary"
import { Spotlight } from "@/shared/ui/Spotlight"

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
}

/**
 * Tela dividida ao meio:
 * esquerda = painel escuro com o burndown de uma sprint + branding;
 * direita = formulário.
 *
 * Uma tela só, sem scroll: o painel é contexto de marca, não uma landing page.
 *
 * O painel é `aria-hidden` — é decoração. O título e o subtítulo reais da
 * página vivem na coluna do formulário, que é por onde o leitor de tela entra.
 */
export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Metade esquerda */}
      <aside
        aria-hidden="true"
        className="relative hidden overflow-hidden bg-ink md:flex md:w-1/2 md:flex-col"
      >
        <DecorBoundary>
          {/* Halo que segue o cursor. Precisa ser filho direto do painel: é ele
              que promove o pai a relative/overflow-hidden. */}
          <Spotlight className="-top-32 left-0 md:-top-20 md:left-16" size={420} />
        </DecorBoundary>

        {/* Vinheta: fecha as bordas e assenta o branding sobre o gráfico. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(110% 78% at 50% 38%, transparent 46%, rgba(10,11,13,0.62) 100%), linear-gradient(to top, rgba(10,11,13,0.92) 6%, transparent 46%)",
          }}
        />

        <div className="relative z-10 flex h-full flex-col p-12">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md border border-paper/30 bg-paper/5 backdrop-blur" />
            <span className="text-sm font-semibold tracking-[0.3em] text-paper-300">
              T4E OFFICE
            </span>
          </div>

          {/* O carrossel ocupa todo o vão entre a marca e o rodapé: visual,
              título e descrição do slide vivem juntos ali. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
            className="flex min-h-0 flex-1 flex-col justify-center py-6"
          >
            <AuthCarousel />
          </motion.div>

          <span className="text-xs text-paper-500">© T4E Group</span>
        </div>
      </aside>

      {/* Metade direita: formulário */}
      <div className="relative flex w-full items-center justify-center bg-paper px-6 py-10 dark:bg-ink-900 sm:px-12 md:w-1/2">
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
          transition={{ duration: 0.7, ease: EASE }}
          className="w-full max-w-[400px]"
        >
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink dark:text-paper">
            {title}
          </h1>
          <p className="mt-2 text-[15px] text-paper-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </motion.div>

        <p className="absolute bottom-6 text-xs text-paper-400">
          © T4E Group · Todos os direitos reservados ·{" "}
          {/* Canal de denúncia é anônimo de propósito (ver AnonymousReportModel)
              — precisa funcionar SEM login, então mora aqui, fora do fluxo
              autenticado, acessível antes mesmo de entrar. */}
          <Link to="/reports" className="underline-offset-4 hover:text-paper-600 hover:underline dark:hover:text-paper-300">
            Canal de denúncias
          </Link>
        </p>
      </div>
    </div>
  )
}
