import { Component, type ErrorInfo, type ReactNode } from "react"

// Isola conteúdo puramente decorativo (cenas WebGL, ilustrações) do resto da
// árvore.
//
// Existe por causa de um incidente real: uma textura do globo 404 em produção
// (rota faltando no vercel.json) e a tela de LOGIN inteira virou "Unexpected
// Application Error!" — ninguém conseguia entrar no sistema por causa de um
// enfeite. `Suspense` não cobria isso: ele trata promessa pendente, não erro.
//
// Regra: nada que seja só visual pode bloquear o uso do sistema. Aqui o erro
// morre e a área simplesmente fica vazia.
interface Props {
  children: ReactNode
  /** O que mostrar no lugar. Padrão: nada — a área fica vazia. */
  fallback?: ReactNode
}

export class DecorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Registrar, não engolir em silêncio: em prod isto costuma ser asset que não
    // subiu no deploy, e sem o log ninguém descobre.
    console.error("[decor] conteúdo decorativo falhou e foi ocultado:", error, info.componentStack)
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null
    return this.props.children
  }
}
