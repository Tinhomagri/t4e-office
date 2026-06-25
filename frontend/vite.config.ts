import react from "@vitejs/plugin-react"
import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Proxy da API: front em :5173 fala com Django em :8000 sem CORS no dev
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
})
