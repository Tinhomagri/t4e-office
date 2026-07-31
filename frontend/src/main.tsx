import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { MotionConfig } from "framer-motion"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router-dom"

import { router } from "@/app/router"
import { extractApiError } from "@/shared/api/client"
import { Toaster, toast } from "@/shared/ui/toast"

import "./index.css"
import "react-datepicker/dist/react-datepicker.css"

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  // Feedback global de erro em qualquer mutation/query sem tocar cada hook.
  mutationCache: new MutationCache({
    onError: (err) => toast.error(extractApiError(err)),
  }),
  queryCache: new QueryCache({
    onError: (err) => toast.error(extractApiError(err)),
  }),
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* reducedMotion="user": respeita "reduzir movimento" do SO em toda animação
          framer-motion (springs, layout, AnimatePresence) sem tocar cada componente. */}
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
        <Toaster />
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
)
