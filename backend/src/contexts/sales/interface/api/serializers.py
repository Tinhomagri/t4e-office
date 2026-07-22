"""Serializers do contexto sales."""
from rest_framework import serializers

_CUSTOMER_KIND = ["company", "person"]
_STAGE_KIND = ["open", "won", "lost"]
_ACTIVITY_KIND = ["note", "task", "meeting"]
_CURRENCY = ["BRL", "USD", "EUR"]


# ── Clientes e contatos ──────────────────────────────────────────────────────

class CreateCustomerSerializer(serializers.Serializer):
    """Payload de criação de cliente."""

    workspace_id = serializers.CharField()
    name = serializers.CharField(max_length=160)
    kind = serializers.ChoiceField(choices=_CUSTOMER_KIND, default="company")
    legal_name = serializers.CharField(max_length=160, required=False, allow_blank=True)
    document = serializers.CharField(max_length=20, required=False, allow_blank=True)
    email = serializers.CharField(max_length=254, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    website = serializers.CharField(max_length=200, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    owner_id = serializers.CharField(required=False, allow_null=True)


class UpdateCustomerSerializer(serializers.Serializer):
    """Payload de atualização parcial de cliente."""

    name = serializers.CharField(max_length=160, required=False)
    kind = serializers.ChoiceField(choices=_CUSTOMER_KIND, required=False)
    legal_name = serializers.CharField(max_length=160, required=False, allow_blank=True)
    document = serializers.CharField(max_length=20, required=False, allow_blank=True)
    email = serializers.CharField(max_length=254, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    website = serializers.CharField(max_length=200, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    owner_id = serializers.CharField(required=False, allow_null=True)


class CustomerSerializer(serializers.Serializer):
    """Representação pública do cliente."""

    id = serializers.CharField()
    workspace_id = serializers.CharField()
    name = serializers.CharField()
    kind = serializers.CharField()
    legal_name = serializers.CharField()
    document = serializers.CharField()
    email = serializers.CharField()
    phone = serializers.CharField()
    website = serializers.CharField()
    notes = serializers.CharField()
    owner_id = serializers.CharField(allow_null=True)


class CreateContactSerializer(serializers.Serializer):
    """Payload de criação de contato."""

    name = serializers.CharField(max_length=160)
    role = serializers.CharField(max_length=120, required=False, allow_blank=True)
    email = serializers.CharField(max_length=254, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    is_primary = serializers.BooleanField(required=False, default=False)


class UpdateContactSerializer(serializers.Serializer):
    """Payload de atualização parcial de contato."""

    name = serializers.CharField(max_length=160, required=False)
    role = serializers.CharField(max_length=120, required=False, allow_blank=True)
    email = serializers.CharField(max_length=254, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    is_primary = serializers.BooleanField(required=False)


class ContactSerializer(serializers.Serializer):
    """Representação pública do contato."""

    id = serializers.CharField()
    customer_id = serializers.CharField()
    name = serializers.CharField()
    role = serializers.CharField()
    email = serializers.CharField()
    phone = serializers.CharField()
    is_primary = serializers.BooleanField()


# ── Estágios do funil ────────────────────────────────────────────────────────

class CreateStageSerializer(serializers.Serializer):
    """Payload de criação de estágio."""

    workspace_id = serializers.CharField()
    name = serializers.CharField(max_length=80)
    slug = serializers.CharField(max_length=50, required=False, allow_blank=True)
    color = serializers.CharField(max_length=7, required=False)
    order = serializers.IntegerField(required=False, min_value=0)
    probability_default = serializers.IntegerField(
        required=False, min_value=0, max_value=100
    )
    kind = serializers.ChoiceField(choices=_STAGE_KIND, default="open")


class UpdateStageSerializer(serializers.Serializer):
    """Payload de atualização parcial de estágio."""

    name = serializers.CharField(max_length=80, required=False)
    color = serializers.CharField(max_length=7, required=False)
    order = serializers.IntegerField(required=False, min_value=0)
    probability_default = serializers.IntegerField(
        required=False, min_value=0, max_value=100
    )
    kind = serializers.ChoiceField(choices=_STAGE_KIND, required=False)


class StageSerializer(serializers.Serializer):
    """Representação pública do estágio do funil."""

    id = serializers.CharField()
    workspace_id = serializers.CharField()
    name = serializers.CharField()
    slug = serializers.CharField()
    color = serializers.CharField()
    order = serializers.IntegerField()
    probability_default = serializers.IntegerField()
    kind = serializers.CharField()


# ── Negócios ─────────────────────────────────────────────────────────────────

class CreateDealSerializer(serializers.Serializer):
    """Payload de criação de negócio."""

    workspace_id = serializers.CharField()
    title = serializers.CharField(max_length=200)
    customer_id = serializers.CharField()
    stage_id = serializers.CharField(required=False, allow_null=True)
    contact_id = serializers.CharField(required=False, allow_null=True)
    amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, min_value=0
    )
    currency = serializers.ChoiceField(choices=_CURRENCY, default="BRL")
    probability = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=100
    )
    expected_close_date = serializers.DateField(required=False, allow_null=True)
    source = serializers.CharField(max_length=60, required=False, allow_blank=True)
    owner_id = serializers.CharField(required=False, allow_null=True)


class UpdateDealSerializer(serializers.Serializer):
    """Payload de atualização parcial de negócio."""

    title = serializers.CharField(max_length=200, required=False)
    customer_id = serializers.CharField(required=False)
    contact_id = serializers.CharField(required=False, allow_null=True)
    amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, min_value=0
    )
    currency = serializers.ChoiceField(choices=_CURRENCY, required=False)
    probability = serializers.IntegerField(required=False, min_value=0, max_value=100)
    expected_close_date = serializers.DateField(required=False, allow_null=True)
    source = serializers.CharField(max_length=60, required=False, allow_blank=True)
    owner_id = serializers.CharField(required=False, allow_null=True)


class MoveDealStageSerializer(serializers.Serializer):
    """Payload de movimentação de negócio entre estágios."""

    stage_id = serializers.CharField()
    previous_deal_id = serializers.CharField(required=False, allow_null=True)
    next_deal_id = serializers.CharField(required=False, allow_null=True)


class WinDealSerializer(serializers.Serializer):
    """Payload do ganho do negócio."""

    create_delivery_project = serializers.BooleanField(required=False, default=False)


class LoseDealSerializer(serializers.Serializer):
    """Payload da perda do negócio."""

    lost_reason = serializers.CharField(max_length=120)
    lost_notes = serializers.CharField(required=False, allow_blank=True)


class DealSerializer(serializers.Serializer):
    """Representação pública do negócio."""

    id = serializers.CharField()
    workspace_id = serializers.CharField()
    title = serializers.CharField()
    customer_id = serializers.CharField()
    customer_name = serializers.CharField()
    contact_id = serializers.CharField(allow_null=True)
    stage_id = serializers.CharField()
    amount = serializers.CharField()
    currency = serializers.CharField()
    probability = serializers.IntegerField()
    weighted_amount = serializers.CharField()
    expected_close_date = serializers.DateField(allow_null=True)
    source = serializers.CharField()
    owner_id = serializers.CharField(allow_null=True)
    lost_reason = serializers.CharField()
    lost_notes = serializers.CharField()
    won_at = serializers.DateTimeField(allow_null=True)
    lost_at = serializers.DateTimeField(allow_null=True)
    delivery_project_id = serializers.CharField(allow_null=True)
    rank = serializers.CharField()


# ── Atividades e histórico ───────────────────────────────────────────────────

class CreateActivitySerializer(serializers.Serializer):
    """Payload de criação de atividade."""

    kind = serializers.ChoiceField(choices=_ACTIVITY_KIND, default="note")
    content = serializers.CharField()
    due_date = serializers.DateTimeField(required=False, allow_null=True)
    end_date = serializers.DateTimeField(required=False, allow_null=True)
    assignee_id = serializers.CharField(required=False, allow_null=True)
    attendees = serializers.ListField(
        child=serializers.EmailField(), required=False, default=list
    )


class UpdateActivitySerializer(serializers.Serializer):
    """Payload de atualização parcial de atividade."""

    content = serializers.CharField(required=False)
    due_date = serializers.DateTimeField(required=False, allow_null=True)
    end_date = serializers.DateTimeField(required=False, allow_null=True)
    assignee_id = serializers.CharField(required=False, allow_null=True)
    done = serializers.BooleanField(required=False)


class ActivitySerializer(serializers.Serializer):
    """Representação pública da atividade."""

    id = serializers.CharField()
    deal_id = serializers.CharField()
    kind = serializers.CharField()
    content = serializers.CharField()
    author_id = serializers.CharField(allow_null=True)
    due_date = serializers.DateTimeField(allow_null=True)
    end_date = serializers.DateTimeField(allow_null=True)
    assignee_id = serializers.CharField(allow_null=True)
    done_at = serializers.DateTimeField(allow_null=True)
    google_event_id = serializers.CharField()
    meet_url = serializers.CharField()
    created_at = serializers.DateTimeField(allow_null=True)


class DealHistorySerializer(serializers.Serializer):
    """Representação pública de uma entrada do histórico."""

    id = serializers.CharField()
    deal_id = serializers.CharField()
    author_id = serializers.CharField(allow_null=True)
    author_name = serializers.CharField()
    field = serializers.CharField()
    from_value = serializers.CharField()
    to_value = serializers.CharField()
    created_at = serializers.DateTimeField(allow_null=True)
