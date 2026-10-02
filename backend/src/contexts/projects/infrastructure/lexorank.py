"""Lexorank — ranking lexicográfico sobre base 36.

Permite inserir um item entre dois outros sem renumerar a lista inteira:
o rank é uma string; `rank_between(a, b)` devolve uma string estritamente
entre `a` e `b` na ordem lexicográfica.
"""

ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
_BASE = len(ALPHABET)

# Tamanho da coluna `CardModel.rank` — rank maior que isto o Postgres recusa.
MAX_RANK_LENGTH = 64
# Inserir sempre no mesmo vão (ex.: topo da lista) alonga o rank ~1 char a
# cada 5 inserções. Passou disto, redistribui os ranks do projeto antes de
# chegar perto do limite da coluna.
REBALANCE_AT_LENGTH = 32


def rank_between(prev: str = "", nxt: str = "") -> str:
    """Rank estritamente entre `prev` e `nxt` (strings vazias = extremos).

    Pré-condição: prev < nxt quando ambos informados.
    """
    if prev and nxt and prev >= nxt:
        raise ValueError("Rank anterior deve ser menor que o posterior.")
    rank: list[str] = []
    i = 0
    while True:
        pc = ALPHABET.index(prev[i]) if i < len(prev) else 0
        nc = ALPHABET.index(nxt[i]) if i < len(nxt) else _BASE
        if nc - pc > 1:
            rank.append(ALPHABET[(pc + nc) // 2])
            return "".join(rank)
        rank.append(ALPHABET[pc])
        if nc - pc == 1:
            # Prefixo já é menor que `nxt`; daqui em diante só precisa superar `prev`.
            nxt = ""
        i += 1


def rank_at_top(project_id: str) -> str:
    """Rank pro card mais novo do projeto: sempre no topo da lista/coluna.

    Card recém-criado é o que a pessoa quer ver primeiro — não enterrado
    depois de centenas de cards antigos. Usado tanto na criação normal
    quanto na criação pelo link público (as duas escritas de card novo
    precisam do mesmo comportamento; ver `repositories_impl.py` e
    `public_views.py`).
    """
    rank = rank_between("", _top_rank(project_id))
    if len(rank) > REBALANCE_AT_LENGTH:
        rebalance_ranks(project_id)
        rank = rank_between("", _top_rank(project_id))
    return rank


def _top_rank(project_id: str) -> str:
    from contexts.projects.infrastructure.django.models import CardModel

    first = (
        CardModel.objects.filter(project_id=project_id)
        .exclude(rank="")
        .order_by("rank")
        .values_list("rank", flat=True)
        .first()
    )
    return first or ""


def rebalance_ranks(project_id: str) -> int:
    """Redistribui os ranks do projeto igualmente espaçados, mantendo a ordem.

    Existe porque card novo entra sempre no topo: cada criação pega o meio
    entre "" e o rank do topo, que converge pra "0…" e cresce sem parar —
    no board Grupo Querino o topo chegou a 64 chars e toda criação passou a
    dar 500 (rank maior que a coluna). Rebalancear zera esse crescimento.
    Card com `rank=""` fica de fora (é papel do `backfill_missing_ranks`).
    """
    from django.db import transaction

    from contexts.projects.infrastructure.django.models import CardModel

    with transaction.atomic():
        cards = list(
            CardModel.objects.select_for_update()
            .filter(project_id=project_id)
            .exclude(rank="")
            .order_by("rank", "number")
        )
        for card, rank in zip(cards, initial_rank_sequence(len(cards)), strict=True):
            card.rank = rank
        CardModel.objects.bulk_update(cards, ["rank"], batch_size=500)
    return len(cards)


def backfill_missing_ranks(card_model, project_id: str) -> int:
    """Dá um rank real pra todo card do projeto que ainda está com `rank=""`
    — sem tocar em quem já tem rank (nunca reseta reordenação manual).

    Existe porque o import do Jira nunca setou rank nos cards importados
    (`import_jira.py`), e sem isto `rank_at_top()` não tem contra quem
    comparar: `.exclude(rank="")` acaba achando "ninguém tem rank", gera um
    valor pro card novo que, sendo não-vazio, sempre vem DEPOIS de "" na
    ordenação — ou seja, cai no fim mesmo com a lógica de "topo" certa.
    Chamado tanto pela migração de backfill histórico quanto ao fim de cada
    import do Jira (idempotente: card que já tem rank não é tocado).

    `card_model` recebido por fora (não importado aqui) pra funcionar tanto
    com o model real quanto com o histórico de uma migração (`apps.get_model`).
    """
    missing = list(
        card_model.objects.filter(project_id=project_id, rank="")
        .order_by("status", "order", "number")
    )
    if not missing:
        return 0
    seq = initial_rank_sequence(len(missing))
    for card, rank in zip(missing, seq, strict=True):
        card.rank = rank
    card_model.objects.bulk_update(missing, ["rank"])
    return len(missing)


def _encode(value: int, width: int) -> str:
    """Codifica um inteiro em base 36 com largura fixa."""
    chars: list[str] = []
    for _ in range(width):
        value, rem = divmod(value, _BASE)
        chars.append(ALPHABET[rem])
    return "".join(reversed(chars))


def initial_rank_sequence(count: int, width: int = 6) -> list[str]:
    """Sequência inicial de ranks igualmente espaçados (para migração/seed).

    Largura fixa deixa folga uniforme entre vizinhos para inserções futuras.
    """
    if count <= 0:
        return []
    space = _BASE**width
    step = max(space // (count + 1), 1)
    return [_encode(min((i + 1) * step, space - 1), width) for i in range(count)]
