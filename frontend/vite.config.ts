/// <reference types="vitest/config" />
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
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/three/**", "src/main.tsx"],
    },
  },
  server: {
    port: 8080,
    // Proxy da API: front em: 8080 fala com Django em :8000 sem CORS no dev
    proxy: {
      "/api": "http://localhost:8000",
      // Uploads (avatar de projeto, anexos) são servidos pelo Django em dev.
      "/media": "http://localhost:8000",
    },
  },
})
