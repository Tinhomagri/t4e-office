import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { AxiosError } from "axios"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router-dom"

import { router } from "@/app/router"
import { Toaster, toast } from "@/shared/ui/toast"

import "./index.css"
import "react-datepicker/dist/react-datepicker.css"

// Mensagem amigável a partir do erro de API (usa o {error} do handler de domínio).
function apiErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { error?: string; detail?: string } | undefined
    return data?.error || data?.detail || "Algo deu errado. Tente novamente."
  }
  return "Algo deu errado. Tente novamente."
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  // Feedback global de erro em qualquer mutation/query sem tocar cada hook.
  mutationCache: new MutationCache({
    onError: (err) => toast.error(apiErrorMessage(err)),
  }),
  queryCache: new QueryCache({
    onError: (err) => toast.error(apiErrorMessage(err)),
  }),
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
