"""Geração do PDF da proposta com ReportLab.

ReportLab é Python puro de propósito: o backend roda serverless na Vercel
(`api/index.py` + `@vercel/python`) e WeasyPrint exigiria pango/cairo como
biblioteca de sistema, o que não existe naquele runtime.

O layout é um orçamento clássico: cabeçalho com número e validade, dados do
cliente, tabela de itens, rodapé com subtotal/desconto/total e as condições.
"""
from __future__ import annotations

from decimal import Decimal
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from contexts.sales.domain.entities.proposal import Proposal

# Paleta alinhada ao design system do app (azul Atlassian).
INK = colors.HexColor("#172B4D")
MUTED = colors.HexColor("#626F86")
BRAND = colors.HexColor("#0C66E4")
LINE = colors.HexColor("#DCDFE4")
ZEBRA = colors.HexColor("#F7F8F9")

SYMBOLS = {"BRL": "R$", "USD": "US$", "EUR": "€"}


def format_money(value: Decimal, currency: str = "BRL") -> str:
    """Formata no padrão pt-BR: milhar com ponto, decimal com vírgula."""
    quantized = Decimal(value).quantize(Decimal("0.01"))
    inteiro, _, centavos = f"{abs(quantized):.2f}".partition(".")
    grupos = []
    while len(inteiro) > 3:
        grupos.insert(0, inteiro[-3:])
        inteiro = inteiro[:-3]
    grupos.insert(0, inteiro)
    corpo = f"{'.'.join(grupos)},{centavos}"
    sinal = "-" if quantized < 0 else ""
    return f"{sinal}{SYMBOLS.get(currency, currency)} {corpo}"


def format_quantity(value: Decimal) -> str:
    """Mostra a quantidade sem zeros à toa: 3 em vez de 3,0000."""
    normalized = Decimal(value).normalize()
    texto = format(normalized, "f")
    return texto.replace(".", ",")


class ReportLabProposalRenderer:
    """Implementação do `ProposalRenderer`."""

    def render(self, proposal: Proposal, *, workspace_name: str = "") -> bytes:
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=18 * mm,
            rightMargin=18 * mm,
            topMargin=18 * mm,
            bottomMargin=18 * mm,
            title=f"Proposta {proposal.number} — {proposal.title}",
            author=workspace_name or "T4E Office",
        )

        styles = self._styles()
        story: list = []

        story += self._header(proposal, workspace_name, styles)
        story += self._client_block(proposal, styles)
        if proposal.intro.strip():
            story.append(Paragraph(self._escape(proposal.intro), styles["body"]))
            story.append(Spacer(1, 6 * mm))

        story.append(self._items_table(proposal))
        story.append(Spacer(1, 4 * mm))
        story.append(self._totals_table(proposal))

        if proposal.terms.strip():
            story.append(Spacer(1, 8 * mm))
            story.append(
                KeepTogether(
                    [
                        Paragraph("Condições comerciais", styles["section"]),
                        Paragraph(self._escape(proposal.terms), styles["small"]),
                    ]
                )
            )

        doc.build(story, onFirstPage=self._footer, onLaterPages=self._footer)
        return buffer.getvalue()

    # ── Blocos ───────────────────────────────────────────────────────────────
    @staticmethod
    def _styles() -> dict:
        base = getSampleStyleSheet()
        return {
            "title": ParagraphStyle(
                "title", parent=base["Title"], fontSize=20, leading=24,
                textColor=INK, alignment=0, spaceAfter=0,
            ),
            "eyebrow": ParagraphStyle(
                "eyebrow", parent=base["Normal"], fontSize=8, leading=10,
                textColor=MUTED, spaceAfter=2,
            ),
            "section": ParagraphStyle(
                "section", parent=base["Normal"], fontSize=9, leading=12,
                textColor=MUTED, fontName="Helvetica-Bold", spaceAfter=3,
            ),
            "body": ParagraphStyle(
                "body", parent=base["Normal"], fontSize=10, leading=15, textColor=INK,
            ),
            "small": ParagraphStyle(
                "small", parent=base["Normal"], fontSize=8.5, leading=12, textColor=MUTED,
            ),
            "cell": ParagraphStyle(
                "cell", parent=base["Normal"], fontSize=9, leading=12, textColor=INK,
            ),
            "cellRight": ParagraphStyle(
                "cellRight", parent=base["Normal"], fontSize=9, leading=12,
                textColor=INK, alignment=TA_RIGHT,
            ),
        }

    def _header(self, proposal: Proposal, workspace_name: str, styles: dict) -> list:
        direita = [Paragraph(f"<b>Proposta nº {proposal.number}</b>", styles["cellRight"])]
        if proposal.valid_until:
            direita.append(
                Paragraph(
                    f"Válida até {proposal.valid_until.strftime('%d/%m/%Y')}",
                    styles["cellRight"],
                )
            )
        if proposal.created_at:
            direita.append(
                Paragraph(
                    f"Emitida em {proposal.created_at.strftime('%d/%m/%Y')}",
                    styles["cellRight"],
                )
            )

        table = Table(
            [[
                [
                    Paragraph((workspace_name or "T4E Office").upper(), styles["eyebrow"]),
                    Paragraph(self._escape(proposal.title), styles["title"]),
                ],
                direita,
            ]],
            colWidths=[105 * mm, 69 * mm],
        )
        table.setStyle(
            TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LINEBELOW", (0, 0), (-1, 0), 1.2, BRAND),
            ])
        )
        return [table, Spacer(1, 6 * mm)]

    def _client_block(self, proposal: Proposal, styles: dict) -> list:
        linhas = []
        if proposal.customer_name:
            linhas.append(Paragraph("PARA", styles["eyebrow"]))
            linhas.append(Paragraph(f"<b>{self._escape(proposal.customer_name)}</b>", styles["body"]))
        if proposal.deal_title:
            linhas.append(
                Paragraph(f"Referente a: {self._escape(proposal.deal_title)}", styles["small"])
            )
        if not linhas:
            return []
        return [*linhas, Spacer(1, 6 * mm)]

    def _items_table(self, proposal: Proposal) -> Table:
        styles = self._styles()
        head = ["Descrição", "Qtd.", "Valor unit.", "Subtotal"]
        rows: list[list] = [head]

        for item in proposal.items:
            rows.append([
                Paragraph(self._escape(item.description), styles["cell"]),
                Paragraph(format_quantity(item.quantity), styles["cellRight"]),
                Paragraph(format_money(item.unit_price, proposal.currency), styles["cellRight"]),
                Paragraph(format_money(item.subtotal, proposal.currency), styles["cellRight"]),
            ])

        if not proposal.items:
            rows.append([Paragraph("Sem itens.", styles["cell"]), "", "", ""])

        table = Table(rows, colWidths=[92 * mm, 18 * mm, 32 * mm, 32 * mm], repeatRows=1)
        estilo = [
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8.5),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
        ]
        # Zebra a partir da primeira linha de dados.
        for index in range(1, len(rows)):
            if index % 2 == 0:
                estilo.append(("BACKGROUND", (0, index), (-1, index), ZEBRA))
        table.setStyle(TableStyle(estilo))
        return table

    def _totals_table(self, proposal: Proposal) -> Table:
        styles = self._styles()
        linhas = [[
            Paragraph("Subtotal", styles["cellRight"]),
            Paragraph(format_money(proposal.subtotal, proposal.currency), styles["cellRight"]),
        ]]
        if proposal.discount > 0:
            linhas.append([
                Paragraph("Desconto", styles["cellRight"]),
                Paragraph(
                    f"− {format_money(proposal.discount, proposal.currency)}",
                    styles["cellRight"],
                ),
            ])
        linhas.append([
            Paragraph("<b>Total</b>", styles["cellRight"]),
            Paragraph(
                f"<b>{format_money(proposal.total, proposal.currency)}</b>",
                styles["cellRight"],
            ),
        ])

        table = Table(linhas, colWidths=[142 * mm, 32 * mm], hAlign="RIGHT")
        table.setStyle(
            TableStyle([
                ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("LINEABOVE", (0, -1), (-1, -1), 1, INK),
                ("TEXTCOLOR", (0, -1), (-1, -1), INK),
            ])
        )
        return table

    @staticmethod
    def _footer(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(
            doc.pagesize[0] - 18 * mm, 12 * mm, f"Página {canvas.getPageNumber()}"
        )
        canvas.restoreState()

    @staticmethod
    def _escape(text: str) -> str:
        """Texto do usuário vira markup do ReportLab — escapar é obrigatório.

        Sem isso, um `&` ou `<` na descrição estoura o parser e derruba a
        geração inteira do PDF.
        """
        return (
            str(text)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\n", "<br/>")
        )
