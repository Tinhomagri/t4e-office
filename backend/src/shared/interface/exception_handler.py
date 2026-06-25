"""Tradução de erros de domínio para respostas HTTP padronizadas do DRF."""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from shared.domain.errors import (
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)

# Mapeia cada erro de domínio para um status HTTP
_STATUS_MAP = {
    ValidationError: status.HTTP_400_BAD_REQUEST,
    PermissionDeniedError: status.HTTP_403_FORBIDDEN,
    NotFoundError: status.HTTP_404_NOT_FOUND,
    ConflictError: status.HTTP_409_CONFLICT,
}


def domain_exception_handler(exc, context):
    """Intercepta erros de domínio; delega o resto ao handler padrão do DRF."""
    for error_type, http_status in _STATUS_MAP.items():
        if isinstance(exc, error_type):
            return Response({"error": str(exc)}, status=http_status)
    return drf_exception_handler(exc, context)
