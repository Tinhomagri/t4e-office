/** Convite pendente atravessando o redirect do OAuth.
 *
 * O login com Google sai da aplicação e volta em `/login/google/callback`, então
 * o `?next=` da URL se perde no caminho. `sessionStorage` sobrevive ao roundtrip
 * (mesma aba, mesma origem) e morre ao fechar a aba — não queremos um convite
 * antigo sequestrando um login futuro.
 */
const KEY = "t4e-pending-invite-token"

export function rememberPendingInvite(token: string): void {
  try {
    sessionStorage.setItem(KEY, token)
  } catch {
    // Modo privado/quota: sem persistência a pessoa reabre o link do e-mail.
  }
}

/** Lê e consome — um convite só é resgatado uma vez. */
export function takePendingInvite(): string | null {
  try {
    const token = sessionStorage.getItem(KEY)
    if (token) sessionStorage.removeItem(KEY)
    return token
  } catch {
    return null
  }
}
