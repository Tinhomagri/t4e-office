"""Casos de uso de gestão dos estágios do funil."""
import re

from contexts.sales.application.use_cases._access import assert_workspace_member
from contexts.sales.application.use_cases.seed_default_stages import SeedDefaultStages
from contexts.sales.domain.entities.stage import PipelineStage, StageKind
from contexts.sales.domain.repositories.customer_repository import WorkspaceAccess
from contexts.sales.domain.repositories.deal_repository import DealRepository
from contexts.sales.domain.repositories.stage_repository import StageRepository
from shared.domain.errors import ConflictError, NotFoundError, ValidationError


def slugify(value: str) -> str:
    """Slug simples e estável a partir do nome do estágio."""
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug[:50]


class ListStages:
    """Lista os estágios do funil, semeando o padrão no primeiro acesso."""

    def __init__(
        self,
        stage_repository: StageRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.stage_repository = stage_repository
        self.workspace_access = workspace_access

    def execute(self, *, workspace_id: str, actor_id: str) -> list[PipelineStage]:
        assert_workspace_member(
            self.workspace_access, workspace_id=workspace_id, actor_id=actor_id
        )
        stages = self.stage_repository.list_by_workspace(workspace_id=workspace_id)
        if not stages:
            stages = SeedDefaultStages(self.stage_repository).execute(
                workspace_id=workspace_id
            )
        return stages


class CreateStage:
    """Adiciona um estágio ao funil do workspace."""

    def __init__(
        self,
        stage_repository: StageRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.stage_repository = stage_repository
        self.workspace_access = workspace_access

    def execute(
        self,
        *,
        workspace_id: str,
        actor_id: str,
        name: str,
        color: str = "#6b7280",
        probability_default: int = 0,
        kind: str = "open",
        slug: str = "",
    ) -> PipelineStage:
        assert_workspace_member(
            self.workspace_access, workspace_id=workspace_id, actor_id=actor_id
        )
        final_slug = slugify(slug or name)
        if not final_slug:
            raise ValidationError("Nome do estágio é obrigatório.")
        if self.stage_repository.slug_exists(
            workspace_id=workspace_id, slug=final_slug
        ):
            raise ConflictError("Já existe um estágio com este nome no funil.")
        order = self.stage_repository.max_order(workspace_id=workspace_id) + 1
        return self.stage_repository.create(
            stage=PipelineStage(
                id=None,
                workspace_id=workspace_id,
                name=name,
                slug=final_slug,
                color=color,
                order=order,
                probability_default=probability_default,
                kind=StageKind(kind),
            )
        )


class UpdateStage:
    """Renomeia, recolore, reordena ou ajusta a probabilidade de um estágio."""

    def __init__(
        self,
        stage_repository: StageRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.stage_repository = stage_repository
        self.workspace_access = workspace_access

    def execute(self, *, stage_id: str, actor_id: str, **changes) -> PipelineStage:
        stage = self.stage_repository.get(stage_id=stage_id)
        if stage is None:
            raise NotFoundError("Estágio não encontrado.")
        assert_workspace_member(
            self.workspace_access,
            workspace_id=stage.workspace_id,
            actor_id=actor_id,
        )

        if "kind" in changes and changes["kind"] is not None:
            new_kind = StageKind(changes["kind"])
            # Não deixar o funil ficar sem estágio de ganho ou de perda
            if stage.kind != new_kind and stage.kind in (StageKind.WON, StageKind.LOST):
                remaining = self.stage_repository.count_by_kind(
                    workspace_id=stage.workspace_id, kind=stage.kind
                )
                if remaining <= 1:
                    raise ValidationError(
                        "O funil precisa manter um estágio de ganho e um de perda."
                    )
            stage.kind = new_kind

        for field in ("name", "color", "order", "probability_default"):
            if changes.get(field) is not None:
                setattr(stage, field, changes[field])

        if changes.get("name"):
            new_slug = slugify(changes["name"])
            if new_slug and new_slug != stage.slug:
                if not self.stage_repository.slug_exists(
                    workspace_id=stage.workspace_id, slug=new_slug
                ):
                    stage.slug = new_slug

        stage.__post_init__()  # revalida as invariantes após as alterações
        return self.stage_repository.update(stage=stage)


class DeleteStage:
    """Remove um estágio, protegendo os estágios de ganho/perda e os que têm negócios."""

    def __init__(
        self,
        stage_repository: StageRepository,
        deal_repository: DealRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.stage_repository = stage_repository
        self.deal_repository = deal_repository
        self.workspace_access = workspace_access

    def execute(self, *, stage_id: str, actor_id: str) -> None:
        stage = self.stage_repository.get(stage_id=stage_id)
        if stage is None:
            raise NotFoundError("Estágio não encontrado.")
        assert_workspace_member(
            self.workspace_access,
            workspace_id=stage.workspace_id,
            actor_id=actor_id,
        )
        if stage.kind in (StageKind.WON, StageKind.LOST):
            remaining = self.stage_repository.count_by_kind(
                workspace_id=stage.workspace_id, kind=stage.kind
            )
            if remaining <= 1:
                raise ValidationError(
                    "O funil precisa manter um estágio de ganho e um de perda."
                )
        if self.deal_repository.count_by_stage(stage_id=stage_id) > 0:
            raise ConflictError(
                "Mova os negócios deste estágio antes de removê-lo."
            )
        self.stage_repository.delete(stage_id=stage_id)
