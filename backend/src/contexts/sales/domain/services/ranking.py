"""Ordenação estável dos negócios na coluna do Kanban.

Reusa o algoritmo Lexorank já existente no projeto — módulo Python puro, sem
dependência de Django nem de models do contexto `projects`.
"""
from contexts.projects.infrastructure.lexorank import rank_between


def next_rank_after(last_rank: str = "") -> str:
    """Rank para inserir um item no fim da coluna."""
    return rank_between(last_rank, "")


def rank_for_position(previous_rank: str = "", next_rank: str = "") -> str:
    """Rank para inserir um item entre dois vizinhos."""
    return rank_between(previous_rank, next_rank)
