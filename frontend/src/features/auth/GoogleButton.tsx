import { useState } from "react"

import { extractApiError } from "@/shared/api/client"

import { getGoogleLoginUrl } from "./auth.api"

interface GoogleButtonProps {
  label: string
}

// Redireciona p/ o consentimento do Google; o backend faz o resto e volta
// para /login/google/callback com os tokens na query string.
export function GoogleButton({ label }: GoogleButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    setError(null)
    setLoading(true)
    try {
      const url = await getGoogleLoginUrl()
      window.location.href = url
    } catch (err) {
      setError(extractApiError(err))
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-ink/15 bg-paper px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/5 disabled:opacity-60 dark:border-paper/15 dark:bg-ink-900 dark:text-paper dark:hover:bg-paper/5"
      >
        <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.11A11.998 11.998 0 0 0 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.28A11.998 11.998 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l3.99-3.11Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.61l3.99 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
          />
        </svg>
        {loading ? "Redirecionando…" : label}
      </button>
      {error && <p className="text-center text-xs text-ink dark:text-paper">{error}</p>}
    </div>
  )
}
