"""Views do contexto github — OAuth, vínculo de repo, webhook e ações no card."""
import secrets

from django.conf import settings
from django.shortcuts import redirect
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.github.application import read_services
from contexts.github.infrastructure import github_api, linking
from contexts.github.infrastructure.django import crypto
from contexts.github.infrastructure.django.models import (
    CardDevLinkModel,
    GithubConnectionModel,
    GithubOAuthStateModel,
    GithubRepoLinkModel,
)
from contexts.projects.infrastructure.django.models import CardModel, ProjectModel
from contexts.projects.infrastructure.django.repositories_impl import (
    DjangoWorkspaceAccess,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError, ValidationError

_access = DjangoWorkspaceAccess()


def _connection(user_id: str) -> GithubConnectionModel | None:
    return GithubConnectionModel.objects.filter(
        user_id=user_id, status="active"
    ).first()


def _client_for(user_id: str) -> github_api.GithubClient:
    conn = _connection(user_id)
    if conn is None:
        raise ValidationError("Conecte sua conta do GitHub primeiro.")
    return github_api.GithubClient(crypto.decrypt(conn.access_token))


def _project_or_403(project_id: str, user_id: str, *, admin: bool = False) -> ProjectModel:
    project = ProjectModel.objects.filter(id=project_id).first()
    if project is None:
        raise NotFoundError("Projeto não encontrado.")
    ok = (
        _access.is_admin(workspace_id=str(project.workspace_id), user_id=user_id)
        if admin
        else _access.is_member(workspace_id=str(project.workspace_id), user_id=user_id)
    )
    if not ok:
        raise PermissionDeniedError("Sem acesso a este projeto.")
    return project


class GithubOAuthUrlView(APIView):
    """Inicia o OAuth: GET /api/github/oauth/url/?return_to=..."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        state = secrets.token_urlsafe(32)
        GithubOAuthStateModel.objects.create(
            state=state,
            user_id=request.user.id,
            return_to=request.query_params.get("return_to", ""),
        )
        return Response({"url": github_api.authorize_url(state=state)})


class GithubOAuthCallbackView(APIView):
    """Callback do OAuth: GET /api/github/oauth/callback/?code&state.

    Público (o GitHub redireciona aqui). A segurança vem do `state` (CSRF).
    """

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        code = request.query_params.get("code")
        state = request.query_params.get("state")
        st = GithubOAuthStateModel.objects.filter(state=state).first()
        if not code or st is None or st.is_expired:
            return Response({"error": "State inválido ou expirado."}, status=400)
        user_id = st.user_id
        st.delete()

        token_data = github_api.exchange_code(code)
        access_token = token_data.get("access_token")
        if not access_token:
            return Response({"error": "Falha ao obter token do GitHub."}, status=400)

        me = github_api.GithubClient(access_token).me()
        GithubConnectionModel.objects.update_or_create(
            user_id=user_id,
            defaults={
                "github_login": me.get("login", ""),
                "github_avatar": me.get("avatar_url", ""),
                "access_token": crypto.encrypt(access_token),
                "scopes": (token_data.get("scope", "") or "").split(","),
                "status": "active",
            },
        )
        front = settings.FRONTEND_URL.rstrip("/")
        return redirect(f"{front}{st.return_to or '/app'}?github=connected")


class GithubStatusView(APIView):
    """Estado da conexão do usuário: GET /api/github/status/."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        conn = _connection(str(request.user.id))
        if conn is None:
            return Response({"connected": False})
        return Response(
            {"connected": True, "login": conn.github_login, "avatar": conn.github_avatar}
        )


class GithubDisconnectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        GithubConnectionModel.objects.filter(user_id=request.user.id).update(
            status="revoked"
        )
        return Response({"ok": True})


class GithubReposView(APIView):
    """Repos disponíveis para vincular: GET /api/github/repos/."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        repos = _client_for(str(request.user.id)).list_repos()
        return Response({"repos": [r for r in repos if r["push"] or r["admin"]]})


class ProjectRepoLinkView(APIView):
    """Vínculos repo↔projeto: GET/POST /api/github/projects/<project_id>/repos/."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        _project_or_403(project_id, str(request.user.id))
        links = GithubRepoLinkModel.objects.filter(project_id=project_id)
        return Response(
            {
                "repos": [
                    {
                        "id": str(link.id),
                        "full_name": link.full_name,
                        "default_branch": link.default_branch,
                        "webhook_active": link.webhook_id is not None,
                    }
                    for link in links
                ]
            }
        )

    def post(self, request: Request, project_id: str) -> Response:
        project = _project_or_403(project_id, str(request.user.id), admin=True)
        full_name = (request.data.get("full_name") or "").strip()
        if not full_name:
            raise ValidationError("Informe o repositório (owner/repo).")
        client = _client_for(str(request.user.id))
        try:
            repo = client.get_repo(full_name)
        except Exception as exc:  # noqa: BLE001 — 404/403: repo inexistente ou sem acesso
            raise ValidationError(
                f"Repositório '{full_name}' não encontrado ou sem acesso com sua conta."
            ) from exc

        webhook_secret = secrets.token_hex(20)
        webhook_id = None
        callback = getattr(settings, "GITHUB_WEBHOOK_CALLBACK_URL", "")
        if callback:
            try:
                hook = client.create_webhook(
                    full_name, callback_url=callback, secret=webhook_secret
                )
                webhook_id = hook.get("id")
            except Exception:  # noqa: BLE001 — sem webhook ainda dá p/ criar branch
                webhook_id = None

        link, _ = GithubRepoLinkModel.objects.update_or_create(
            project_id=project.id,
            full_name=full_name,
            defaults={
                "workspace_id": project.workspace_id,
                "default_branch": repo.get("default_branch", "main"),
                "webhook_id": webhook_id,
                "webhook_secret": webhook_secret,
                "connected_by_id": request.user.id,
            },
        )
        return Response(
            {
                "id": str(link.id),
                "full_name": link.full_name,
                "default_branch": link.default_branch,
                "webhook_active": webhook_id is not None,
            },
            status=status.HTTP_201_CREATED,
        )


class ProjectRepoUnlinkView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request: Request, project_id: str, link_id: str) -> Response:
        _project_or_403(project_id, str(request.user.id), admin=True)
        GithubRepoLinkModel.objects.filter(id=link_id, project_id=project_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectDevMetricsView(APIView):
    """Métricas de desenvolvimento do projeto: GET .../projects/<id>/dev/."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        _project_or_403(project_id, str(request.user.id))
        return Response(read_services.project_dev_metrics(project_id))


class CardDevLinksView(APIView):
    """Painel de desenvolvimento do card: GET /api/github/cards/<card_id>/links/."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, card_id: str) -> Response:
        card = CardModel.objects.filter(id=card_id).first()
        if card is None:
            raise NotFoundError("Card não encontrado.")
        _project_or_403(str(card.project_id), str(request.user.id))
        links = CardDevLinkModel.objects.filter(card_id=card_id)
        has_repo = GithubRepoLinkModel.objects.filter(
            project_id=card.project_id
        ).exists()
        return Response(
            {
                "repo_connected": has_repo,
                "links": [
                    {
                        "id": str(link.id),
                        "kind": link.kind,
                        "title": link.title,
                        "url": link.url,
                        "state": link.state,
                        "branch": link.branch,
                        "number": link.number,
                        "author_login": link.author_login,
                        "author_avatar": link.author_avatar,
                        "updated_at": link.updated_at.isoformat(),
                    }
                    for link in links
                ],
            }
        )


class CardCreateBranchView(APIView):
    """Cria uma branch no repo do projeto a partir do card (estilo Jira)."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, card_id: str) -> Response:
        card = CardModel.objects.filter(id=card_id).first()
        if card is None:
            raise NotFoundError("Card não encontrado.")
        project = _project_or_403(str(card.project_id), str(request.user.id))

        repo = GithubRepoLinkModel.objects.filter(project_id=card.project_id).first()
        if repo is None:
            raise ValidationError("Nenhum repositório vinculado a este projeto.")

        client = _client_for(str(request.user.id))
        base = request.data.get("from_branch") or repo.default_branch
        new_branch = request.data.get("branch") or linking.branch_name_for(
            card, project.key
        )
        try:
            sha = client.branch_sha(repo.full_name, base)
        except Exception as exc:  # noqa: BLE001 — 404: branch-base não existe / repo vazio
            raise ValidationError(
                f"Branch base '{base}' não encontrada no {repo.full_name} "
                "(repositório vazio ou branch padrão diferente)."
            ) from exc
        try:
            client.create_branch(repo.full_name, new_branch, sha)
        except Exception as exc:  # noqa: BLE001 — 422: branch já existe
            msg = "já existe" if "422" in str(exc) else str(exc)
            raise ValidationError(f"Não foi possível criar a branch '{new_branch}': {msg}") from exc

        url = f"https://github.com/{repo.full_name}/tree/{new_branch}"
        linking.upsert_link(
            card=card,
            repo=repo,
            kind="branch",
            external_id=new_branch,
            title=new_branch,
            url=url,
            branch=new_branch,
            state="open",
            author_login=_connection(str(request.user.id)).github_login,
        )
        return Response(
            {"branch": new_branch, "url": url}, status=status.HTTP_201_CREATED
        )


class GithubWebhookView(APIView):
    """Recebe eventos do GitHub: POST /api/github/webhook/ (público, assinado)."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        event = request.headers.get("X-GitHub-Event", "")
        signature = request.headers.get("X-Hub-Signature-256", "")
        payload = request.data
        repo_full = (payload.get("repository") or {}).get("full_name", "")
        if not repo_full:
            return Response({"ok": True})

        # Valida assinatura contra o secret de algum repo vinculado com esse nome.
        for repo in GithubRepoLinkModel.objects.filter(full_name=repo_full):
            if linking.verify_signature(
                secret=repo.webhook_secret, body=request.body, signature=signature
            ):
                if event == "push":
                    linking.handle_push(repo, payload)
                elif event == "pull_request":
                    linking.handle_pull_request(repo, payload)
        return Response({"ok": True})
