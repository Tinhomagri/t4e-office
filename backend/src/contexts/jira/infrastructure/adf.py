"""Conversor de Atlassian Document Format (ADF) para texto simples.

O Jira Cloud REST v3 devolve `description` e corpo de comentário como ADF
(árvore JSON), não texto puro. Não tentamos fidelidade total de formatação —
só extrair o conteúdo legível para `CardModel.description`/`CardCommentModel.body`,
que são campos de texto simples.
"""
from __future__ import annotations

_BLOCK_TYPES = {"paragraph", "heading", "codeBlock", "blockquote", "rule", "table"}


def adf_to_text(doc: dict | None) -> str:
    if not isinstance(doc, dict):
        return ""
    blocks = [_render_block(node) for node in doc.get("content") or []]
    return "\n\n".join(b for b in blocks if b)


def _render_block(node: dict) -> str:
    ntype = node.get("type")
    if ntype in ("paragraph", "heading"):
        return _render_inline(node.get("content") or [])
    if ntype == "codeBlock":
        return f"```\n{_render_inline(node.get('content') or [])}\n```"
    if ntype == "blockquote":
        inner = "\n\n".join(_render_block(n) for n in node.get("content") or [])
        return "\n".join(f"> {line}" for line in inner.splitlines())
    if ntype in ("bulletList", "orderedList"):
        lines = []
        for item in node.get("content") or []:
            text = "\n".join(
                rendered
                for rendered in (_render_block(n) for n in item.get("content") or [])
                if rendered
            )
            lines.append(f"- {text}")
        return "\n".join(lines)
    if ntype == "rule":
        return "---"
    if ntype == "table":
        rows = []
        for row in node.get("content") or []:
            cells = [
                " ".join(
                    rendered
                    for rendered in (_render_block(n) for n in cell.get("content") or [])
                    if rendered
                )
                for cell in row.get("content") or []
            ]
            rows.append(" | ".join(cells))
        return "\n".join(rows)
    if ntype in ("mediaGroup", "mediaSingle", "extension"):
        return ""
    if "content" in node:
        return _render_inline(node.get("content") or [])
    return ""


def _render_inline(nodes: list[dict]) -> str:
    parts = []
    for node in nodes:
        ntype = node.get("type")
        if ntype == "text":
            parts.append(node.get("text", ""))
        elif ntype == "hardBreak":
            parts.append("\n")
        elif ntype == "mention":
            attrs = node.get("attrs") or {}
            text = attrs.get("text") or attrs.get("id") or ""
            parts.append(text if text.startswith("@") else f"@{text}")
        elif ntype == "emoji":
            attrs = node.get("attrs") or {}
            parts.append(attrs.get("text") or attrs.get("shortName") or "")
        elif ntype == "inlineCard":
            attrs = node.get("attrs") or {}
            parts.append(attrs.get("url") or "")
        elif "content" in node:
            parts.append(_render_inline(node.get("content") or []))
    return "".join(parts)
