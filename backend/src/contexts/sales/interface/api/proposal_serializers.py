"""Serializers das propostas comerciais.

Os de saída recebem a entidade (dataclass), então são `Serializer` puros com
os totais vindo das properties — o dinheiro é calculado no domínio, nunca aqui.
"""
from rest_framework import serializers


class ProposalLineItemSerializer(serializers.Serializer):
    id = serializers.CharField(allow_null=True)
    description = serializers.CharField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=4)
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=2)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    position = serializers.IntegerField()


class ProposalSerializer(serializers.Serializer):
    id = serializers.CharField()
    workspace_id = serializers.CharField()
    deal_id = serializers.CharField()
    deal_title = serializers.CharField(allow_blank=True)
    customer_name = serializers.CharField(allow_blank=True)
    number = serializers.IntegerField()
    title = serializers.CharField()
    status = serializers.CharField()
    currency = serializers.CharField()
    intro = serializers.CharField(allow_blank=True)
    terms = serializers.CharField(allow_blank=True)
    valid_until = serializers.DateField(allow_null=True)
    items = ProposalLineItemSerializer(many=True)
    discount = serializers.DecimalField(max_digits=14, decimal_places=2)
    # Derivados do domínio.
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    is_editable = serializers.BooleanField(read_only=True)
    sent_at = serializers.DateTimeField(allow_null=True)
    sent_to = serializers.CharField(allow_blank=True)
    accepted_at = serializers.DateTimeField(allow_null=True)
    rejected_at = serializers.DateTimeField(allow_null=True)
    rejection_reason = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField(allow_null=True)
    updated_at = serializers.DateTimeField(allow_null=True)


class LineItemInputSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=300)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=4)
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=2)


class CreateProposalSerializer(serializers.Serializer):
    workspace_id = serializers.UUIDField()
    deal_id = serializers.UUIDField()
    title = serializers.CharField(max_length=200, required=False, allow_blank=True)
    currency = serializers.CharField(max_length=3, required=False, allow_blank=True)
    intro = serializers.CharField(required=False, allow_blank=True)
    terms = serializers.CharField(required=False, allow_blank=True)
    valid_until = serializers.DateField(required=False, allow_null=True)
    discount = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, default=0
    )
    items = LineItemInputSerializer(many=True, required=False)


class UpdateProposalSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200, required=False)
    currency = serializers.CharField(max_length=3, required=False)
    intro = serializers.CharField(required=False, allow_blank=True)
    terms = serializers.CharField(required=False, allow_blank=True)
    valid_until = serializers.DateField(required=False, allow_null=True)
    discount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    items = LineItemInputSerializer(many=True, required=False)


class SendProposalSerializer(serializers.Serializer):
    to_email = serializers.EmailField()
    message = serializers.CharField(required=False, allow_blank=True)


class RejectProposalSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True)
