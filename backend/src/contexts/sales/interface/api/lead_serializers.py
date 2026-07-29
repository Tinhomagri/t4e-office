"""Serializers de leads."""
from rest_framework import serializers


class LeadSerializer(serializers.Serializer):
    """Saída: alimentado direto pela entidade `Lead` (dataclass)."""

    id = serializers.CharField()
    workspace_id = serializers.CharField()
    name = serializers.CharField()
    company = serializers.CharField(allow_blank=True)
    email = serializers.CharField(allow_blank=True)
    phone = serializers.CharField(allow_blank=True)
    source = serializers.CharField(allow_blank=True)
    score = serializers.IntegerField()
    status = serializers.SerializerMethodField()
    disqualify_reason = serializers.CharField(allow_blank=True)
    owner_id = serializers.CharField(allow_null=True)
    notes = serializers.CharField(allow_blank=True)
    first_contact_due_at = serializers.DateTimeField(allow_null=True)
    contacted_at = serializers.DateTimeField(allow_null=True)
    converted_at = serializers.DateTimeField(allow_null=True)
    converted_deal_id = serializers.CharField(allow_null=True)
    converted_customer_id = serializers.CharField(allow_null=True)
    # Derivados do domínio — a tela não recalcula prazo/estado.
    is_open = serializers.BooleanField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    created_at = serializers.DateTimeField(allow_null=True)
    updated_at = serializers.DateTimeField(allow_null=True)

    def get_status(self, obj) -> str:
        return obj.status.value


class CreateLeadSerializer(serializers.Serializer):
    workspace_id = serializers.CharField()
    name = serializers.CharField(max_length=160)
    company = serializers.CharField(max_length=160, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    source = serializers.CharField(max_length=60, required=False, allow_blank=True)
    owner_id = serializers.CharField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class UpdateLeadSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160, required=False)
    company = serializers.CharField(max_length=160, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    source = serializers.CharField(max_length=60, required=False, allow_blank=True)
    owner_id = serializers.CharField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class ImportLeadsSerializer(serializers.Serializer):
    workspace_id = serializers.CharField()
    csv_text = serializers.CharField(
        help_text="Conteúdo bruto do CSV, colunas: name,company,email,phone,source"
    )


class ImportLeadsResultSerializer(serializers.Serializer):
    imported = LeadSerializer(many=True)
    errors = serializers.ListField(child=serializers.DictField())


class QualifyLeadSerializer(serializers.Serializer):
    score = serializers.IntegerField(min_value=0, max_value=100)


class DisqualifyLeadSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=160)


class ConvertLeadSerializer(serializers.Serializer):
    deal_title = serializers.CharField(max_length=200, required=False, allow_blank=True)
    amount = serializers.CharField(required=False, allow_blank=True)


class ConvertLeadResultSerializer(serializers.Serializer):
    lead = LeadSerializer()
    customer_id = serializers.CharField()
    deal_id = serializers.CharField()
