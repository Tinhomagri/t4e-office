"""Erros base do domínio — independentes de framework."""


class DomainError(Exception):
    """Erro genérico de violação de regra de negócio."""


class ValidationError(DomainError):
    """Dado de entrada viola uma invariante do domínio."""


class NotFoundError(DomainError):
    """Entidade requisitada não existe."""


class PermissionDeniedError(DomainError):
    """Ator não tem permissão para a operação."""


class ConflictError(DomainError):
    """Operação conflita com o estado atual (ex.: recurso duplicado)."""
