"""Port de consulta ao workflow do projeto."""
from typing import Protocol


class StatusCategoryResolver(Protocol):
    """Resolve a categoria de uma coluna do board.

    A categoria (`todo` | `in_progress` | `done`) mora em WorkflowStatus, que é
    configurável por projeto — a entidade Card guarda só o slug do status e não
    tem como saber se aquela coluna significa "concluído". Quem precisa dessa
    resposta é a regra de resolução: entrar numa coluna `done` resolve o card,
    sair dela reabre.
    """

    def category_of(self, *, project_id: str, status: str) -> str | None:
        """Categoria da coluna, ou `None` se o status não existir no projeto."""
        ...
