"""Serializers do contexto projects."""
from rest_framework import serializers


class CreateProjectSerializer(serializers.Serializer):
    """Payload de criação de projeto."""

    workspace_id = serializers.CharField()
    name = serializers.CharField(max_length=120)
    key = serializers.CharField(max_length=10, min_length=2)
    template = serializers.ChoiceField(
        choices=["software", "campanha", "social", "conteudo"], default="software"
    )


class ProjectSerializer(serializers.Serializer):
    """Representação pública do projeto."""

    id = serializers.CharField()
    name = serializers.CharField()
    key = serializers.CharField()
    workspace_id = serializers.CharField()
    template = serializers.CharField(default="software")


_STATUS = [
    "backlog", "todo", "doing", "review", "done",
    # fluxo marketing
    "briefing", "criacao", "aprovacao", "agendado", "publicado",
]
_TYPE = [
    "feature", "bug", "debt", "spike", "chore", "epic",
    # tipos marketing
    "post", "peca", "campanha", "artigo", "email",
]
_PRIORITY = ["low", "medium", "high", "urgent"]
# Desfecho do card — espelha CardResolution no domínio.
_RESOLUTION = ["done", "wont_do", "duplicate", "cannot_reproduce", "incomplete"]
_SPRINT_STATUS = ["planned", "active", "closed"]


class CreateCardSerializer(serializers.Serializer):
    """Payload de criação de card."""

    title = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    # Slug livre, não ChoiceField: colunas criadas no projeto (WorkflowStatus)
    # têm slugs fora da lista padrão. Quem valida se a coluna existe é o
    # caso de uso, que conhece o workflow do projeto.
    status = serializers.CharField(max_length=40, default="todo")
    type = serializers.ChoiceField(choices=_TYPE, default="feature")
    priority = serializers.ChoiceField(choices=_PRIORITY, default="medium")
    points = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    assignee_id = serializers.CharField(required=False, allow_null=True)
    reporter_id = serializers.CharField(required=False, allow_null=True)
    sprint_id = serializers.CharField(required=False, allow_null=True)
    start_date = serializers.DateField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    parent_id = serializers.CharField(required=False, allow_null=True)
    epic_id = serializers.CharField(required=False, allow_null=True)
    epic_color = serializers.CharField(required=False, allow_blank=True, max_length=7)
    labels = serializers.ListField(
        child=serializers.CharField(max_length=40), required=False
    )
    channel = serializers.CharField(required=False, allow_blank=True, max_length=30)
    publish_date = serializers.DateField(required=False, allow_null=True)


class UpdateCardSerializer(serializers.Serializer):
    """Payload de atualização parcial de card (todos os campos opcionais)."""

    title = serializers.CharField(max_length=200, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    status = serializers.CharField(max_length=40, required=False)
    type = serializers.ChoiceField(choices=_TYPE, required=False)
    priority = serializers.ChoiceField(choices=_PRIORITY, required=False)
    points = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    assignee_id = serializers.CharField(required=False, allow_null=True)
    reporter_id = serializers.CharField(required=False, allow_null=True)
    sprint_id = serializers.CharField(required=False, allow_null=True)
    start_date = serializers.DateField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    order = serializers.IntegerField(required=False)
    parent_id = serializers.CharField(required=False, allow_null=True)
    epic_id = serializers.CharField(required=False, allow_null=True)
    epic_color = serializers.CharField(required=False, allow_blank=True, max_length=7)
    labels = serializers.ListField(
        child=serializers.CharField(max_length=40), required=False
    )
    channel = serializers.CharField(required=False, allow_blank=True, max_length=30)
    publish_date = serializers.DateField(required=False, allow_null=True)
    # `allow_blank` para permitir limpar o desfecho ("" → None no caso de uso) e
    # reabrir o card sem precisar mexer no status.
    resolution = serializers.ChoiceField(
        choices=_RESOLUTION, required=False, allow_blank=True, allow_null=True
    )
    original_estimate_seconds = serializers.IntegerField(
        required=False, allow_null=True, min_value=0
    )
    remaining_estimate_seconds = serializers.IntegerField(
        required=False, allow_null=True, min_value=0
    )
    archived = serializers.BooleanField(required=False)


class CardSerializer(serializers.Serializer):
    """Representação pública do card."""

    id = serializers.CharField()
    ref = serializers.CharField()  # ex.: MIA-142
    project_id = serializers.CharField()
    number = serializers.IntegerField()
    title = serializers.CharField()
    description = serializers.CharField()
    status = serializers.CharField()
    type = serializers.CharField()
    priority = serializers.CharField()
    points = serializers.IntegerField(allow_null=True)
    assignee_id = serializers.CharField(allow_null=True)
    reporter_id = serializers.CharField(allow_null=True)
    sprint_id = serializers.CharField(allow_null=True)
    start_date = serializers.DateField(allow_null=True)
    due_date = serializers.DateField(allow_null=True)
    order = serializers.IntegerField()
    rank = serializers.CharField(allow_blank=True, default="")
    parent_id = serializers.CharField(allow_null=True)
    epic_id = serializers.CharField(allow_null=True, default=None)
    epic_color = serializers.CharField(allow_blank=True, default="")
    labels = serializers.ListField(child=serializers.CharField())
    channel = serializers.CharField(allow_blank=True, default="")
    publish_date = serializers.DateField(allow_null=True, default=None)
    resolution = serializers.CharField(allow_null=True, default=None)
    resolved_at = serializers.DateTimeField(allow_null=True, default=None)
    original_estimate_seconds = serializers.IntegerField(allow_null=True, default=None)
    remaining_estimate_seconds = serializers.IntegerField(allow_null=True, default=None)
    archived = serializers.BooleanField(default=False)
    archived_at = serializers.DateTimeField(allow_null=True, default=None)
    # Contadores para densidade do card (anotados na view, sem N+1).
    comments_count = serializers.IntegerField(default=0)
    attachments_count = serializers.IntegerField(default=0)
    subtasks_count = serializers.IntegerField(default=0)
    subtasks_done = serializers.IntegerField(default=0)
    created_at = serializers.DateTimeField(allow_null=True, default=None)
    updated_at = serializers.DateTimeField(allow_null=True, default=None)


class CreateCommentSerializer(serializers.Serializer):
    """Payload de criação de comentário."""

    body = serializers.CharField()
    # Ids de usuários mencionados (@) — notificados na criação.
    mentions = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )


class CommentSerializer(serializers.Serializer):
    """Representação pública do comentário."""

    id = serializers.CharField()
    card_id = serializers.CharField()
    author_id = serializers.CharField()
    author_name = serializers.CharField()
    body = serializers.CharField()
    created_at = serializers.DateTimeField()


_LINK_TYPE = ["relates", "blocks", "duplicates"]


class CreateIssueLinkSerializer(serializers.Serializer):
    """Payload de criação de vínculo entre cards."""

    target_id = serializers.CharField()
    link_type = serializers.ChoiceField(choices=_LINK_TYPE, default="relates")


class _LinkedCardSerializer(serializers.Serializer):
    id = serializers.CharField()
    ref = serializers.CharField()
    title = serializers.CharField()
    status = serializers.CharField()
    type = serializers.CharField()


class IssueLinkSerializer(serializers.Serializer):
    """Representação de vínculo na perspectiva do card observado."""

    id = serializers.CharField()
    link_type = serializers.CharField()
    direction = serializers.CharField()  # outgoing | incoming
    other_card = _LinkedCardSerializer(allow_null=True)


class CardHistorySerializer(serializers.Serializer):
    """Representação de uma entrada de histórico do card."""

    id = serializers.CharField()
    card_id = serializers.CharField()
    author_id = serializers.CharField(allow_null=True)
    author_name = serializers.CharField()
    field = serializers.CharField()
    old_value = serializers.CharField(allow_blank=True)
    new_value = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()


class CreateSprintSerializer(serializers.Serializer):
    """Payload de criação de sprint."""

    name = serializers.CharField(max_length=120)
    goal = serializers.CharField(required=False, allow_blank=True, default="")
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)


class UpdateSprintSerializer(serializers.Serializer):
    """Payload de atualização parcial de sprint."""

    name = serializers.CharField(max_length=120, required=False)
    goal = serializers.CharField(required=False, allow_blank=True)
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)
    status = serializers.ChoiceField(choices=_SPRINT_STATUS, required=False)


class SprintSerializer(serializers.Serializer):
    """Representação pública da sprint."""

    id = serializers.CharField()
    project_id = serializers.CharField()
    name = serializers.CharField()
    goal = serializers.CharField()
    start_date = serializers.DateField(allow_null=True)
    end_date = serializers.DateField(allow_null=True)
    status = serializers.CharField()
    started_at = serializers.DateTimeField(allow_null=True, default=None)
    completed_at = serializers.DateTimeField(allow_null=True, default=None)
