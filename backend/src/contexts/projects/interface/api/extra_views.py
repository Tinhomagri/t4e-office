"""Views para Versions, Components, Worklogs, Attachments e CustomFields.

Todas as rotas validam pertencimento ao workspace (multi-tenancy) e a
capacidade do papel de projeto (Domínio 12) antes de qualquer escrita.
Leituras exigem apenas BROWSE (ser membro). Detail views resolvem o projeto a
partir do próprio objeto.
"""
import uuid

from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.infrastructure.django.models import (
    AttachmentModel,
    BoardMessageModel,
    CardComponentModel,
    CardHistoryModel,
    CardVersionModel,
    ComponentModel,
    CustomFieldModel,
    DocumentModel,
    IssueFieldValueModel,
    SavedFilterModel,
    VersionModel,
    WorkflowStatusModel,
    WorklogModel,
)
from contexts.projects.interface.api import capabilities as caps
from contexts.projects.interface.api.permissions import (
    assert_card_capability,
    assert_card_member,
    assert_project_capability,
    assert_project_member,
)
from shared.domain.errors import NotFoundError


def _uid(request: Request) -> str:
    return str(request.user.id)


def _guard_obj(model, object_id: str, user_id: str, capability: str):
    """Resolve o projeto de um objeto project-scoped e valida a capacidade. Retorna o objeto."""
    obj = model.objects.filter(pk=object_id).first()
    if obj is None:
        raise NotFoundError("Recurso não encontrado.")
    assert_project_capability(
        project_id=str(obj.project_id), user_id=user_id, capability=capability
    )
    return obj


# ── Versions ──────────────────────────────────────────────────────────────────

class VersionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=_uid(request))
        qs = VersionModel.objects.filter(project_id=project_id)
        return Response([_ser_version(v) for v in qs])

    def post(self, request: Request, project_id: str) -> Response:
        assert_project_capability(
            project_id=str(project_id), user_id=_uid(request), capability=caps.MANAGE_VERSIONS
        )
        v = VersionModel.objects.create(
            project_id=project_id,
            name=request.data.get("name", ""),
            description=request.data.get("description", ""),
            release_date=request.data.get("release_date") or None,
            released=request.data.get("released", False),
        )
        return Response(_ser_version(v), status=status.HTTP_201_CREATED)


class VersionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request: Request, version_id: str) -> Response:
        v = _guard_obj(VersionModel, str(version_id), _uid(request), caps.MANAGE_VERSIONS)
        for f in ("name", "description", "release_date", "released"):
            if f in request.data:
                setattr(v, f, request.data[f] or None if f == "release_date" else request.data[f])
        v.save()
        return Response(_ser_version(v))

    def delete(self, request: Request, version_id: str) -> Response:
        v = _guard_obj(VersionModel, str(version_id), _uid(request), caps.MANAGE_VERSIONS)
        v.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _ser_version(v: VersionModel) -> dict:
    return {
        "id": str(v.id), "project_id": str(v.project_id), "name": v.name,
        "description": v.description,
        "release_date": v.release_date.isoformat() if v.release_date else None,
        "released": v.released, "created_at": v.created_at.isoformat(),
    }


# ── Card ↔ Version ────────────────────────────────────────────────────────────

class CardVersionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, card_id: str) -> Response:
        assert_card_member(card_id=str(card_id), user_id=_uid(request))
        qs = CardVersionModel.objects.filter(card_id=card_id).select_related("version")
        return Response([_ser_version(r.version) for r in qs])

    def post(self, request: Request, card_id: str) -> Response:
        assert_card_capability(card_id=str(card_id), user_id=_uid(request), capability=caps.EDIT_ISSUE)
        version_id = request.data.get("version_id")
        CardVersionModel.objects.get_or_create(card_id=card_id, version_id=version_id)
        return Response(status=status.HTTP_201_CREATED)

    def delete(self, request: Request, card_id: str) -> Response:
        assert_card_capability(card_id=str(card_id), user_id=_uid(request), capability=caps.EDIT_ISSUE)
        version_id = request.data.get("version_id")
        CardVersionModel.objects.filter(card_id=card_id, version_id=version_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Components ────────────────────────────────────────────────────────────────

class ComponentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=_uid(request))
        qs = ComponentModel.objects.filter(project_id=project_id)
        return Response([_ser_component(c) for c in qs])

    def post(self, request: Request, project_id: str) -> Response:
        assert_project_capability(
            project_id=str(project_id), user_id=_uid(request), capability=caps.MANAGE_COMPONENTS
        )
        c = ComponentModel.objects.create(
            project_id=project_id,
            name=request.data.get("name", ""),
            lead_id=request.data.get("lead_id") or None,
        )
        return Response(_ser_component(c), status=status.HTTP_201_CREATED)


class ComponentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request: Request, component_id: str) -> Response:
        c = _guard_obj(ComponentModel, str(component_id), _uid(request), caps.MANAGE_COMPONENTS)
        c.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _ser_component(c: ComponentModel) -> dict:
    return {"id": str(c.id), "project_id": str(c.project_id), "name": c.name, "lead_id": str(c.lead_id) if c.lead_id else None}


# ── Card ↔ Component ──────────────────────────────────────────────────────────

class CardComponentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, card_id: str) -> Response:
        assert_card_member(card_id=str(card_id), user_id=_uid(request))
        qs = CardComponentModel.objects.filter(card_id=card_id).select_related("component")
        return Response([_ser_component(r.component) for r in qs])

    def post(self, request: Request, card_id: str) -> Response:
        assert_card_capability(card_id=str(card_id), user_id=_uid(request), capability=caps.EDIT_ISSUE)
        CardComponentModel.objects.get_or_create(card_id=card_id, component_id=request.data.get("component_id"))
        return Response(status=status.HTTP_201_CREATED)

    def delete(self, request: Request, card_id: str) -> Response:
        assert_card_capability(card_id=str(card_id), user_id=_uid(request), capability=caps.EDIT_ISSUE)
        CardComponentModel.objects.filter(card_id=card_id, component_id=request.data.get("component_id")).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Worklogs ──────────────────────────────────────────────────────────────────

class WorklogListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, card_id: str) -> Response:
        assert_card_member(card_id=str(card_id), user_id=_uid(request))
        qs = WorklogModel.objects.filter(card_id=card_id).select_related("author")
        return Response([_ser_worklog(w) for w in qs])

    def post(self, request: Request, card_id: str) -> Response:
        assert_card_capability(card_id=str(card_id), user_id=_uid(request), capability=caps.EDIT_ISSUE)
        w = WorklogModel.objects.create(
            card_id=card_id,
            author=request.user,
            time_seconds=int(request.data.get("time_seconds", 0)),
            started_at=request.data.get("started_at") or timezone.now(),
            comment=request.data.get("comment", ""),
        )
        return Response(_ser_worklog(w), status=status.HTTP_201_CREATED)


class WorklogDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request: Request, worklog_id: str) -> Response:
        w = WorklogModel.objects.filter(pk=worklog_id).select_related("card__project").first()
        if w is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        assert_card_member(card_id=str(w.card_id), user_id=_uid(request))
        # Só o autor remove seu próprio worklog.
        if str(w.author_id) == _uid(request):
            w.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _ser_worklog(w: WorklogModel) -> dict:
    return {
        "id": str(w.id), "card_id": str(w.card_id),
        "author_id": str(w.author_id), "author_name": w.author.full_name,
        "time_seconds": w.time_seconds,
        "started_at": w.started_at.isoformat(),
        "comment": w.comment, "created_at": w.created_at.isoformat(),
    }


# ── Attachments ───────────────────────────────────────────────────────────────

class AttachmentListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request: Request, card_id: str) -> Response:
        assert_card_member(card_id=str(card_id), user_id=_uid(request))
        qs = AttachmentModel.objects.filter(card_id=card_id)
        return Response([_ser_attachment(a, request) for a in qs])

    def post(self, request: Request, card_id: str) -> Response:
        assert_card_capability(card_id=str(card_id), user_id=_uid(request), capability=caps.EDIT_ISSUE)
        file = request.FILES.get("file")
        if not file:
            return Response({"error": "file required"}, status=status.HTTP_400_BAD_REQUEST)
        a = AttachmentModel.objects.create(
            card_id=card_id, author=request.user,
            filename=file.name, file=file,
            mime_type=getattr(file, "content_type", ""),
            size=file.size,
        )
        return Response(_ser_attachment(a, request), status=status.HTTP_201_CREATED)


class AttachmentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request: Request, attachment_id: str) -> Response:
        att = AttachmentModel.objects.filter(pk=attachment_id).select_related("card__project").first()
        if att is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        assert_card_member(card_id=str(att.card_id), user_id=_uid(request))
        # Só o autor remove seu próprio anexo.
        if str(att.author_id) == _uid(request):
            att.file.delete(save=False)
            att.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _ser_attachment(a: AttachmentModel, request: Request) -> dict:
    url = request.build_absolute_uri(a.file.url) if a.file else None
    return {
        "id": str(a.id), "card_id": str(a.card_id),
        "author_id": str(a.author_id) if a.author_id else None, "filename": a.filename,
        "url": url, "mime_type": a.mime_type, "size": a.size,
        "group_id": str(a.group_id), "version": a.version,
        "approval_status": a.approval_status,
        "created_at": a.created_at.isoformat(),
    }


# ── CustomFields ──────────────────────────────────────────────────────────────

class CustomFieldListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=_uid(request))
        qs = CustomFieldModel.objects.filter(project_id=project_id)
        return Response([_ser_cf(f) for f in qs])

    def post(self, request: Request, project_id: str) -> Response:
        assert_project_capability(
            project_id=str(project_id), user_id=_uid(request), capability=caps.MANAGE_CUSTOM_FIELDS
        )
        f = CustomFieldModel.objects.create(
            project_id=project_id,
            name=request.data.get("name", ""),
            field_type=request.data.get("field_type", "text"),
            options=request.data.get("options", []),
            required=request.data.get("required", False),
        )
        return Response(_ser_cf(f), status=status.HTTP_201_CREATED)


class CustomFieldDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request: Request, field_id: str) -> Response:
        f = _guard_obj(CustomFieldModel, str(field_id), _uid(request), caps.MANAGE_CUSTOM_FIELDS)
        f.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _ser_cf(f: CustomFieldModel) -> dict:
    return {
        "id": str(f.id), "project_id": str(f.project_id),
        "name": f.name, "field_type": f.field_type,
        "options": f.options, "required": f.required,
    }


# ── IssueFieldValues ──────────────────────────────────────────────────────────

class IssueFieldValueView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, card_id: str) -> Response:
        assert_card_member(card_id=str(card_id), user_id=_uid(request))
        qs = IssueFieldValueModel.objects.filter(card_id=card_id).select_related("field")
        return Response([_ser_fv(v) for v in qs])

    def put(self, request: Request, card_id: str) -> Response:
        """Upsert: {field_id, value_json}"""
        assert_card_capability(card_id=str(card_id), user_id=_uid(request), capability=caps.EDIT_ISSUE)
        field_id = request.data.get("field_id")
        value = request.data.get("value_json")
        obj, _ = IssueFieldValueModel.objects.update_or_create(
            card_id=card_id, field_id=field_id,
            defaults={"value_json": value},
        )
        return Response(_ser_fv(obj))


def _ser_fv(v: IssueFieldValueModel) -> dict:
    return {
        "id": str(v.id), "card_id": str(v.card_id),
        "field_id": str(v.field_id), "field_name": v.field.name,
        "field_type": v.field.field_type, "value_json": v.value_json,
    }


# ── WorkflowStatuses ──────────────────────────────────────────────────────────

# Fluxo padrão do time. Todo projeto de software nasce com estas cinco colunas;
# criar outras continua livre, mas são estas que aparecem sem ninguém pedir.
#
# Os slugs `todo`/`doing`/`done` são preservados de propósito nas pontas: o
# `CardModel.status` guarda o slug, e o resto do sistema (Resumo, métricas,
# "concluído nos últimos 7 dias", presença no Escritório) reconhece esses três.
# Trocá-los por nomes novos quebraria essas leituras em silêncio.
DEFAULT_STATUSES = [
    {"name": "Itens pendentes", "slug": "todo", "category": "todo", "color": "#6b7280", "order": 0},
    # `is_working`: card aqui faz o boneco sentar na mesa no Escritório.
    {"name": "Em andamento", "slug": "doing", "category": "in_progress", "color": "#3b82f6", "order": 1, "is_working": True},
    {"name": "Backend / integrar", "slug": "backend", "category": "in_progress", "color": "#8b5cf6", "order": 2},
    {"name": "Code Review", "slug": "review", "category": "in_progress", "color": "#f59e0b", "order": 3},
    # `is_done`: some da lista de pendências, conta como entregue nas métricas.
    {"name": "Concluídos", "slug": "done", "category": "done", "color": "#10b981", "order": 4, "is_done": True},
]

# Workflow dos templates de marketing (Campanha / Social Media / Conteúdo)
MARKETING_STATUSES = [
    {"name": "Briefing", "slug": "briefing", "category": "todo", "color": "#8b5cf6", "order": 0},
    {"name": "Criação", "slug": "criacao", "category": "in_progress", "color": "#3b82f6", "order": 1},
    {"name": "Aprovação", "slug": "aprovacao", "category": "in_progress", "color": "#f59e0b", "order": 2},
    {"name": "Agendado", "slug": "agendado", "category": "in_progress", "color": "#06b6d4", "order": 3},
    {"name": "Publicado", "slug": "publicado", "category": "done", "color": "#10b981", "order": 4, "is_done": True},
]

TEMPLATE_STATUSES = {
    "software": DEFAULT_STATUSES,
    "campanha": MARKETING_STATUSES,
    "social": MARKETING_STATUSES,
    "conteudo": MARKETING_STATUSES,
}


def seed_workflow_statuses(project_id: str, template: str) -> None:
    """Cria os statuses iniciais do projeto conforme o template escolhido."""
    if WorkflowStatusModel.objects.filter(project_id=project_id).exists():
        return
    for d in TEMPLATE_STATUSES.get(template, DEFAULT_STATUSES):
        WorkflowStatusModel.objects.create(project_id=project_id, is_default=True, **d)


def _ser_ws(ws: WorkflowStatusModel) -> dict:
    return {
        "id": str(ws.id), "project_id": str(ws.project_id),
        "name": ws.name, "slug": ws.slug,
        "category": ws.category, "color": ws.color,
        "order": ws.order, "is_default": ws.is_default,
        "wip_limit": ws.wip_limit, "is_working": ws.is_working,
        "is_done": ws.is_done,
    }


class WorkflowStatusListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=_uid(request))
        qs = WorkflowStatusModel.objects.filter(project_id=project_id)
        if not qs.exists():
            # Seed on first access, conforme o template do projeto
            from contexts.projects.infrastructure.django.models import ProjectModel
            template = (
                ProjectModel.objects.filter(id=project_id)
                .values_list("template", flat=True)
                .first()
            ) or "software"
            seed_workflow_statuses(str(project_id), template)
            qs = WorkflowStatusModel.objects.filter(project_id=project_id)
        return Response([_ser_ws(ws) for ws in qs])

    def post(self, request: Request, project_id: str) -> Response:
        assert_project_capability(
            project_id=str(project_id), user_id=_uid(request), capability=caps.MANAGE_WORKFLOW
        )
        max_order = WorkflowStatusModel.objects.filter(
            project_id=project_id
        ).values_list("order", flat=True).order_by("-order").first() or 0
        ws = WorkflowStatusModel.objects.create(
            project_id=project_id,
            name=request.data.get("name", "Novo status"),
            slug=request.data.get("slug", "").strip().lower().replace(" ", "-") or str(uuid.uuid4())[:8],
            category=request.data.get("category", "todo"),
            color=request.data.get("color", "#6b7280"),
            order=max_order + 1,
        )
        return Response(_ser_ws(ws), status=status.HTTP_201_CREATED)


class WorkflowStatusDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request: Request, status_id: str) -> Response:
        ws = _guard_obj(WorkflowStatusModel, str(status_id), _uid(request), caps.MANAGE_WORKFLOW)
        for f in ("name", "slug", "category", "color", "order"):
            if f in request.data:
                setattr(ws, f, request.data[f])
        if "is_working" in request.data:
            ws.is_working = bool(request.data["is_working"])
        if "is_done" in request.data:
            ws.is_done = bool(request.data["is_done"])
        # 0/"" /null no wip_limit significam "sem limite", não zero cards.
        if "wip_limit" in request.data:
            raw = request.data["wip_limit"]
            ws.wip_limit = int(raw) if raw else None
        ws.save()
        return Response(_ser_ws(ws))

    def delete(self, request: Request, status_id: str) -> Response:
        ws = _guard_obj(WorkflowStatusModel, str(status_id), _uid(request), caps.MANAGE_WORKFLOW)
        ws.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── SavedFilters (quick filters do board) ─────────────────────────────────────

def _ser_sf(sf: SavedFilterModel) -> dict:
    return {
        "id": str(sf.id), "project_id": str(sf.project_id),
        "owner_id": str(sf.owner_id), "name": sf.name,
        "jql": sf.jql, "shared": sf.shared,
    }


class SavedFilterListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        uid = _uid(request)
        assert_project_member(project_id=str(project_id), user_id=uid)
        from django.db.models import Q
        qs = SavedFilterModel.objects.filter(project_id=project_id).filter(
            Q(shared=True) | Q(owner_id=uid)
        )
        return Response([_ser_sf(sf) for sf in qs])

    def post(self, request: Request, project_id: str) -> Response:
        uid = _uid(request)
        assert_project_member(project_id=str(project_id), user_id=uid)
        name = (request.data.get("name") or "").strip()
        jql = (request.data.get("jql") or "").strip()
        if not name or not jql:
            return Response({"error": "Nome e JQL são obrigatórios."}, status=status.HTTP_400_BAD_REQUEST)
        sf = SavedFilterModel.objects.create(
            project_id=project_id,
            owner_id=uid,
            name=name[:80],
            jql=jql,
            shared=bool(request.data.get("shared", True)),
        )
        return Response(_ser_sf(sf), status=status.HTTP_201_CREATED)


class SavedFilterDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request: Request, filter_id: str) -> Response:
        uid = _uid(request)
        sf = SavedFilterModel.objects.filter(pk=filter_id).first()
        if sf is None:
            raise NotFoundError("Filtro não encontrado.")
        if str(sf.owner_id) != uid:
            # Não-dono só remove se tiver capacidade de gerenciar o workflow do projeto.
            assert_project_capability(
                project_id=str(sf.project_id), user_id=uid, capability=caps.MANAGE_WORKFLOW
            )
        sf.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Documents (aba Documentos — colaborativo, persistido no servidor) ────────

def _ser_doc(doc: DocumentModel, *, with_content: bool = True) -> dict:
    data = {
        "id": str(doc.id), "project_id": str(doc.project_id),
        "title": doc.title,
        "created_by": str(doc.created_by),
        "updated_by": str(doc.updated_by) if doc.updated_by else None,
        "created_at": doc.created_at.isoformat(),
        "updated_at": doc.updated_at.isoformat(),
    }
    if with_content:
        data["content"] = doc.content
    return data


class DocumentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=_uid(request))
        # Lista não traz o conteúdo inteiro — evita payload pesado na sidebar.
        docs = DocumentModel.objects.filter(project_id=project_id)
        return Response([_ser_doc(d, with_content=False) for d in docs])

    def post(self, request: Request, project_id: str) -> Response:
        uid = _uid(request)
        assert_project_capability(
            project_id=str(project_id), user_id=uid, capability=caps.CREATE_ISSUE
        )
        doc = DocumentModel.objects.create(
            project_id=project_id,
            title=request.data.get("title") or "Sem título",
            content=request.data.get("content", ""),
            created_by=uid,
            updated_by=uid,
        )
        return Response(_ser_doc(doc), status=status.HTTP_201_CREATED)


def _ser_board_message_reply_to(m: BoardMessageModel) -> dict | None:
    if m.reply_to_id is None or m.reply_to is None:
        return None
    return {
        "id": str(m.reply_to.id),
        "author_name": m.reply_to.author_name,
        "body": m.reply_to.body[:140],
    }


def _ser_board_message(m: BoardMessageModel) -> dict:
    return {
        "id": str(m.id),
        "author_name": m.author_name,
        "body": m.body,
        "from_team": m.from_team,
        "created_at": m.created_at.isoformat(),
        "reply_to": _ser_board_message_reply_to(m),
    }


class BoardMessageListCreateView(APIView):
    """Mural do board, visto de dentro do app — mesma mensagem que aparece
    no link público, o time responde daqui com `from_team=True`."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=_uid(request))
        mensagens = BoardMessageModel.objects.filter(project_id=project_id).select_related("reply_to")
        return Response([_ser_board_message(m) for m in mensagens])

    def post(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=_uid(request))
        body = str(request.data.get("body") or "").strip()
        if not body:
            return Response({"error": "Escreva uma mensagem."}, status=400)
        reply_to_id = str(request.data.get("reply_to_id") or "").strip()
        reply_to = (
            BoardMessageModel.objects.filter(id=reply_to_id, project_id=project_id).first()
            if reply_to_id
            else None
        )
        mensagem = BoardMessageModel.objects.create(
            project_id=project_id,
            author_name=request.user.full_name,
            body=body,
            from_team=True,
            reply_to=reply_to,
        )
        return Response(_ser_board_message(mensagem), status=status.HTTP_201_CREATED)


class DocumentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, document_id: str) -> Response:
        uid = _uid(request)
        doc = DocumentModel.objects.filter(pk=document_id).first()
        if doc is None:
            raise NotFoundError("Documento não encontrado.")
        assert_project_member(project_id=str(doc.project_id), user_id=uid)
        return Response(_ser_doc(doc))

    def patch(self, request: Request, document_id: str) -> Response:
        doc = _guard_obj(DocumentModel, str(document_id), _uid(request), caps.CREATE_ISSUE)
        for f in ("title", "content"):
            if f in request.data:
                setattr(doc, f, request.data[f])
        doc.updated_by = _uid(request)
        doc.save()
        return Response(_ser_doc(doc))

    def delete(self, request: Request, document_id: str) -> Response:
        doc = _guard_obj(DocumentModel, str(document_id), _uid(request), caps.CREATE_ISSUE)
        doc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Activity feed (aba Resumo, estilo Jira) ─────────────────────────────────

class ProjectActivityView(APIView):
    """Últimas mudanças de campo em cards do projeto — feed da aba Resumo."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=_uid(request))
        rows = (
            CardHistoryModel.objects.filter(card__project_id=project_id)
            .select_related("author", "card", "card__project")
            .order_by("-created_at")[:30]
        )
        return Response([
            {
                "id": str(h.id),
                "card_ref": f"{h.card.project.key}-{h.card.number}",
                "card_title": h.card.title,
                "field": h.field,
                "old_value": h.old_value,
                "new_value": h.new_value,
                "author_id": str(h.author_id) if h.author_id else None,
                "author_name": h.author.full_name if h.author_id else "Sistema",
                "created_at": h.created_at.isoformat(),
            }
            for h in rows
        ])
