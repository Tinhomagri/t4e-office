import type { LucideIcon } from "lucide-react"

import { Badge, PageHeader } from "./primitives"

// Estado honesto para telas cujo bounded context de backend ainda não existe.
// Sem dados falsos: explica o que será entregue e em que fase.
export function ComingSoon({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  phase,
  features,
}: {
  icon: LucideIcon
  eyebrow: string
  title: string
  subtitle: string
  phase: string
  features: string[]
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <Icon className="size-4 text-brand-500" />
            <span>{eyebrow}</span>
          </>
        }
        title={title}
        subtitle={subtitle}
      >
        <Badge tone="brand">{phase}</Badge>
      </PageHeader>

      <div className="surface relative min-h-[70vh] overflow-hidden p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-brand-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-brand-100/40 blur-3xl" />
        <div className="relative mx-auto max-w-3xl">
          <div className="grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-brand-glow">
            <Icon className="size-10" />
          </div>
          <h2 className="mt-7 text-2xl font-semibold text-ink dark:text-paper">Em construção</h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-paper-500">
            Esta tela ainda não está ligada a um backend real. Para não exibir dados falsos,
            mostramos aqui o que será entregue — assim nada na interface mente sobre o estado do
            sistema.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-3 rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-900 px-5 py-4 text-[15px] leading-snug text-ink dark:text-paper"
              >
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
