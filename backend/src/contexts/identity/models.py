"""Ponto de descoberta de models pelo Django.

Os models reais vivem em infrastructure/django/models.py (camada de infra).
Este módulo apenas reexporta para o autoload do Django encontrá-los.
"""
from contexts.identity.infrastructure.django.models import (  # noqa: F401
    InvitationModel,
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
