"""Serializers de metas comerciais (Metas & Forecast)."""
import re

from rest_framework import serializers

_CURRENCY = ["BRL", "USD", "EUR"]
_PERIOD_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _validate_period(value: str) -> str:
    if not _PERIOD_RE.match(value):
        raise serializers.ValidationError("Período deve estar no formato AAAA-MM.")
    return value


class CreateGoalSerializer(serializers.Serializer):
    """Payload de criação de meta."""

    workspace_id = serializers.CharField()
    period = serializers.CharField(validators=[_validate_period])
    target_amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)
    currency = serializers.ChoiceField(choices=_CURRENCY, default="BRL")
    owner_id = serializers.CharField(required=False, allow_null=True)


class UpdateGoalSerializer(serializers.Serializer):
    """Payload de atualização parcial de meta."""

    target_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=0, required=False
    )
    currency = serializers.ChoiceField(choices=_CURRENCY, required=False)


class GoalSerializer(serializers.Serializer):
    """Representação pública da meta."""

    id = serializers.CharField()
    workspace_id = serializers.CharField()
    period = serializers.CharField()
    target_amount = serializers.CharField()
    currency = serializers.CharField()
    owner_id = serializers.CharField(allow_null=True)
