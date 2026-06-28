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
    port: 8080,
    // Proxy da API: front em: 8080 fala com Django em :8000 sem CORS no dev
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
})
