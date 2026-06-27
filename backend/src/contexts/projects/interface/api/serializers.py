"""Serializers do contexto projects."""
from rest_framework import serializers


class CreateProjectSerializer(serializers.Serializer):
    """Payload de criação de projeto."""

    workspace_id = serializers.CharField()
    name = serializers.CharField(max_length=120)
    key = serializers.CharField(max_length=10, min_length=2)


class ProjectSerializer(serializers.Serializer):
    """Representação pública do projeto."""

    id = serializers.CharField()
    name = serializers.CharField()
    key = serializers.CharField()
    workspace_id = serializers.CharField()


_STATUS = ["backlog", "todo", "doing", "review", "done"]
_TYPE = ["feature", "bug", "debt", "spike", "chore"]
_PRIORITY = ["low", "medium", "high", "urgent"]
_SPRINT_STATUS = ["planned", "active", "closed"]


class CreateCardSerializer(serializers.Serializer):
    """Payload de criação de card."""

    title = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    status = serializers.ChoiceField(choices=_STATUS, default="todo")
    type = serializers.ChoiceField(choices=_TYPE, default="feature")
    priority = serializers.ChoiceField(choices=_PRIORITY, default="medium")
    points = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    assignee_id = serializers.CharField(required=False, allow_null=True)
    sprint_id = serializers.CharField(required=False, allow_null=True)


class UpdateCardSerializer(serializers.Serializer):
    """Payload de atualização parcial de card (todos os campos opcionais)."""

    title = serializers.CharField(max_length=200, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=_STATUS, required=False)
    type = serializers.ChoiceField(choices=_TYPE, required=False)
    priority = serializers.ChoiceField(choices=_PRIORITY, required=False)
    points = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    assignee_id = serializers.CharField(required=False, allow_null=True)
    sprint_id = serializers.CharField(required=False, allow_null=True)
    order = serializers.IntegerField(required=False)


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
    sprint_id = serializers.CharField(allow_null=True)
    order = serializers.IntegerField()


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
