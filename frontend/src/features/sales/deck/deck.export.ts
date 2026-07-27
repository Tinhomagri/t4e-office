// Exportação do Command Deck.
//
// html2canvas, jsPDF e SheetJS são pesados e só interessam a quem clica em
// exportar — todos entram por `import()` dinâmico, fora do bundle inicial.
// CSV é gerado à mão (Blob), sem dependência.

export interface Sheet {
  /** Nome da aba no Excel / sufixo do arquivo no CSV. */
  name: string
  columns: string[]
  rows: (string | number | null)[][]
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoga no próximo tick: revogar síncrono cancela o download no Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

/** Escapa por RFC 4180 e força texto quando o valor pareceria fórmula. */
function csvCell(value: string | number | null): string {
  if (value == null) return ""
  let s = String(value)
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * CSV para Excel-BR: separador `;` (o pt-BR usa vírgula decimal) e BOM UTF-8,
 * sem o qual acentos chegam corrompidos no Excel do Windows.
 */
export function sheetToCsv(sheet: Sheet, prefix = "comercial"): void {
  const lines = [
    sheet.columns.map(csvCell).join(";"),
    ...sheet.rows.map((r) => r.map(csvCell).join(";")),
  ]
  const blob = new Blob(["\ufeff", lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
  download(blob, `${prefix}-${slug(sheet.name)}-${stamp()}.csv`)
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

// ─── Excel ───────────────────────────────────────────────────────────────────

/** Planilha real com uma aba por Sheet. Números vão como número, não texto. */
export async function sheetsToXlsx(sheets: Sheet[], prefix = "comercial"): Promise<void> {
  const XLSX = await import("xlsx")
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([sheet.columns, ...sheet.rows])
    ws["!cols"] = sheet.columns.map((c) => ({ wch: Math.max(12, Math.min(40, c.length + 6)) }))
    // O Excel trunca nome de aba em 31 caracteres — corta antes para não gerar
    // duas abas com o mesmo nome truncado.
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
  }
  XLSX.writeFile(wb, `${prefix}-${stamp()}.xlsx`)
}

// ─── Imagem / PDF ────────────────────────────────────────────────────────────

async function snapshot(el: HTMLElement): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas")
  return html2canvas(el, {
    // Fundo do deck: sem isto o PNG sai com transparência e some no branco.
    backgroundColor: "#0A0B0D",
    scale: Math.min(2, window.devicePixelRatio || 1),
    logging: false,
    useCORS: true,
  })
}

export async function elementToPng(el: HTMLElement, name: string): Promise<void> {
  const canvas = await snapshot(el)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"))
  if (blob) download(blob, `${slug(name)}-${stamp()}.png`)
}

/**
 * PDF A4 paisagem com cabeçalho. A imagem é escalada para caber na página
 * inteira mantendo proporção — um deck alto vira uma página comprida reduzida,
 * não uma imagem cortada.
 */
export async function elementToPdf(
  el: HTMLElement,
  { title, subtitle }: { title: string; subtitle: string },
): Promise<void> {
  const [canvas, { jsPDF }] = await Promise.all([snapshot(el), import("jspdf")])
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 28
  const headerH = 44

  pdf.setFillColor(10, 11, 13)
  pdf.rect(0, 0, pageW, pageH, "F")
  pdf.setTextColor(241, 242, 244)
  pdf.setFontSize(14)
  pdf.text(title, margin, margin + 6)
  pdf.setFontSize(9)
  pdf.setTextColor(138, 140, 147)
  pdf.text(subtitle, margin, margin + 22)

  const availW = pageW - margin * 2
  const availH = pageH - margin * 2 - headerH
  const scale = Math.min(availW / canvas.width, availH / canvas.height)
  const w = canvas.width * scale
  const h = canvas.height * scale
  pdf.addImage(
    canvas.toDataURL("image/png"),
    "PNG",
    margin + (availW - w) / 2,
    margin + headerH,
    w,
    h,
  )
  pdf.save(`comercial-dashboard-${stamp()}.pdf`)
}
