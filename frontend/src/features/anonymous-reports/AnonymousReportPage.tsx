import { useMutation } from "@tanstack/react-query"
import { CheckCircle2, LockKeyhole, Send, ShieldAlert } from "lucide-react"
import { useState } from "react"

import {
  submitAnonymousReport,
  type AnonymousReportCategory,
} from "./anonymous-reports.api"

const CATEGORIES: { value: AnonymousReportCategory; label: string }[] = [
  { value: "conduct", label: "Conduta inadequada" },
  { value: "harassment", label: "Assédio ou discriminação" },
  { value: "security", label: "Segurança ou saúde" },
  { value: "fraud", label: "Fraude ou irregularidade" },
  { value: "other", label: "Outro assunto" },
]

export function AnonymousReportPage() {
  const [category, setCategory] = useState<AnonymousReportCategory>("conduct")
  const [description, setDescription] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const mutation = useMutation({
    mutationFn: submitAnonymousReport,
    onSuccess: () => setSubmitted(true),
  })

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (description.trim().length < 20) return
    mutation.mutate({ category, description: description.trim() })
  }

  return (
    <main className="min-h-screen overflow-y-auto bg-paper px-5 py-10 text-ink sm:px-8 dark:bg-ink dark:text-paper">
      <section className="mx-auto w-full max-w-2xl">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-ink text-paper dark:bg-paper dark:text-ink">
            <ShieldAlert className="size-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-paper-500">T4E Group</p>
            <h1 className="text-xl font-bold">Canal de denúncias</h1>
          </div>
        </div>

        {submitted ? (
          <div className="surface p-8 text-center sm:p-12">
            <CheckCircle2 className="mx-auto size-11 text-emerald-600" />
            <h2 className="mt-5 text-2xl font-bold">Denúncia recebida</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-paper-500">
              Obrigado por relatar. O conteúdo será analisado pelo canal responsável.
              Não registramos dados que identifiquem quem enviou esta denúncia.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="surface p-6 sm:p-8">
            <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-relaxed text-blue-950">
              <LockKeyhole className="mt-0.5 size-5 shrink-0 text-blue-700" />
              <p>
                Este canal é anônimo. Não solicitamos nome, email, login, anexos nem dados de navegação.
                Evite incluir informações que possam identificar você no relato.
              </p>
            </div>

            <div className="mt-7">
              <label htmlFor="category" className="mb-2 block text-sm font-medium">Sobre o que é a denúncia?</label>
              <select id="category" value={category} onChange={(e) => setCategory(e.target.value as AnonymousReportCategory)} className="input-box !pl-4">
                {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>

            <div className="mt-5">
              <label htmlFor="description" className="mb-2 block text-sm font-medium">Conte o que aconteceu</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva os fatos, o contexto e, se ajudar na apuração, datas ou locais. Não informe dados pessoais seus."
                rows={9}
                maxLength={8000}
                className="w-full resize-y rounded-xl border border-ink/15 bg-paper-100 p-4 text-[15px] leading-relaxed text-ink placeholder-paper-400 outline-none transition focus:border-ink focus:bg-paper focus:ring-4 focus:ring-ink/5 dark:bg-ink-800 dark:text-paper"
                required
              />
              <div className="mt-2 flex justify-between text-xs text-paper-500">
                <span>Mínimo de 20 caracteres</span><span>{description.length}/8000</span>
              </div>
            </div>

            {mutation.isError && <p role="alert" className="mt-4 text-sm text-red-600">Não foi possível enviar agora. Tente novamente.</p>}
            <button type="submit" disabled={mutation.isPending || description.trim().length < 20} className="btn-solid mt-6 flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed">
              <Send className="size-4" /> {mutation.isPending ? "Enviando…" : "Enviar denúncia anônima"}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
