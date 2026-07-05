"""Lexorank — ranking lexicográfico sobre base 36.

Permite inserir um item entre dois outros sem renumerar a lista inteira:
o rank é uma string; `rank_between(a, b)` devolve uma string estritamente
entre `a` e `b` na ordem lexicográfica.
"""

ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
_BASE = len(ALPHABET)


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
