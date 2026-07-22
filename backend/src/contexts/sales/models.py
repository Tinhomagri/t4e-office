"""Ponto de descoberta de models pelo Django (models reais em infrastructure)."""
from contexts.sales.infrastructure.django.models import (  # noqa: F401
    ContactModel,
    CustomerModel,
    DealActivityModel,
    DealHistoryModel,
    DealModel,
    PipelineStageModel,
)
