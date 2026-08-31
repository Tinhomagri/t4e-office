# MCP Remoto para Criação de Cards via Claude — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qualquer pessoa da equipe gera um token pessoal no próprio office (self-service) e conecta o Claude dela a um servidor MCP remoto hospedado no mesmo servidor de produção, sem clonar repo nem configurar nada localmente.

**Architecture:** Novo model `PersonalAccessToken` + nova `authentication_class` DRF no backend Django existente (reaproveita capabilities normais). Novo container `mcp-server` (proxy fino, transporte HTTP) que repassa o Bearer token recebido de cada chamada MCP direto pro backend. Nova seção "Tokens de API" no frontend React já existente. Deploy: novo serviço no `docker-compose.prod.yml` do servidor, roteado por um novo `Host()` no Traefik (`dynamic.yml`) em `mcp.t4egroup.com.br`.

**Tech Stack:** Django 5 + DRF + pytest (backend), React + Vite + TypeScript + react-query + axios (frontend), Python + `mcp` SDK (`mcp<2`, FastMCP) + httpx (mcp-server), Docker Compose + Traefik v3 (infra).

**Spec:** `docs/superpowers/specs/2026-08-31-mcp-cards-remoto-design.md`

## Global Constraints

- Token pessoal vale como a permissão normal do usuário — sem sistema de escopo separado.
- Sem expiração automática de token — só revogação manual.
- Nunca persistir o token em texto puro — só o hash SHA-256 (`token_hash`, `max_length=64`).
- Servidor MCP não guarda credencial nenhuma — só repassa o `Authorization` header recebido.
- Testes de backend rodam com `pytest -q` de dentro de `backend/` (settings `config.settings.test`, sem Postgres real). Sem `conftest.py` — fixtures locais por arquivo, seguindo `backend/src/contexts/identity/tests/test_profile_api.py`.
- Autenticação em teste de API usa `APIClient()` + `force_authenticate(user)`, exceto os testes específicos de `PersonalTokenAuthentication`, que precisam de `client.credentials(HTTP_AUTHORIZATION=...)` real.

---

### Task 1: Model `PersonalAccessToken` + migration

**Files:**
- Modify: `backend/src/contexts/identity/infrastructure/django/models.py` (adicionar classe no final do arquivo, após `WorkspaceModel` e demais models existentes)
- Create: `backend/src/contexts/identity/migrations/0013_personalaccesstoken.py`
- Test: `backend/src/contexts/identity/tests/test_personal_access_token_model.py`

**Interfaces:**
- Produces: `PersonalAccessToken` model com campos `id` (UUID), `user` (FK `UserModel`, `related_name="personal_tokens"`), `name` (`CharField`, `blank=True`), `token_hash` (`CharField(max_length=64, unique=True)`), `created_at` (`auto_now_add`), `last_used_at` (`DateTimeField(null=True, blank=True)`), `revoked_at` (`DateTimeField(null=True, blank=True)`).

- [ ] **Step 1: Escrever teste do model**

```python
# backend/src/contexts/identity/tests/test_personal_access_token_model.py
import pytest

from contexts.identity.infrastructure.django.models import PersonalAccessToken, UserModel


@pytest.fixture
def user(db):
    return UserModel.objects.create_user(
        email="pat@t4e.com", password="senha-123", full_name="PAT User", is_active=True
    )


def test_personal_access_token_defaults_to_not_revoked(user):
    token = PersonalAccessToken.objects.create(user=user, token_hash="a" * 64)
    assert token.revoked_at is None
    assert token.last_used_at is None
    assert token.name == ""


def test_personal_access_token_hash_is_unique(user):
    PersonalAccessToken.objects.create(user=user, token_hash="b" * 64)
    with pytest.raises(Exception):
        PersonalAccessToken.objects.create(user=user, token_hash="b" * 64)
```

- [ ] **Step 2: Rodar teste, confirmar que falha**

Run: `cd backend && pytest src/contexts/identity/tests/test_personal_access_token_model.py -v`
Expected: FAIL — `ImportError: cannot import name 'PersonalAccessToken'`

- [ ] **Step 3: Adicionar o model**

Adicionar no final de `backend/src/contexts/identity/infrastructure/django/models.py` (mesmo padrão de `PasswordResetToken`, linhas 107-128 do arquivo):

```python
class PersonalAccessToken(models.Model):
    """Token pessoal de API, usado por integrações externas (ex.: MCP do Claude).

    Vale como a permissão normal do usuário dono — sem sistema de escopo
    separado. Sem expiração automática: só revogação manual (`revoked_at`).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        UserModel, on_delete=models.CASCADE, related_name="personal_tokens"
    )
    name = models.CharField(max_length=100, blank=True)
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "identity_personal_access_token"

    def __str__(self) -> str:
        return self.name or str(self.id)
```

- [ ] **Step 4: Gerar a migration**

Run: `cd backend && python manage.py makemigrations identity --name personalaccesstoken`

Confirmar que o arquivo gerado é `backend/src/contexts/identity/migrations/0013_personalaccesstoken.py` e bate com este conteúdo (estilo idêntico a `0003_password_reset.py`):

```python
# Generated by Django 5.2.8 on 2026-08-31 00:00

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0012_restrict_non_owner_spaces'),
    ]

    operations = [
        migrations.CreateModel(
            name='PersonalAccessToken',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(blank=True, max_length=100)),
                ('token_hash', models.CharField(max_length=64, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('last_used_at', models.DateTimeField(blank=True, null=True)),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='personal_tokens', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'identity_personal_access_token',
            },
        ),
    ]
```

- [ ] **Step 5: Rodar teste, confirmar que passa**

Run: `cd backend && pytest src/contexts/identity/tests/test_personal_access_token_model.py -v`
Expected: PASS (2 testes)

- [ ] **Step 6: Commit**

```bash
git add backend/src/contexts/identity/infrastructure/django/models.py \
  backend/src/contexts/identity/migrations/0013_personalaccesstoken.py \
  backend/src/contexts/identity/tests/test_personal_access_token_model.py
git commit -m "feat(identity): adiciona model PersonalAccessToken"
```

---

### Task 2: `PersonalTokenAuthentication` + geração/verificação de token

**Files:**
- Create: `backend/src/contexts/identity/infrastructure/django/personal_token_authentication.py`
- Modify: `backend/src/config/settings/base.py:135-137` (adicionar segunda classe em `DEFAULT_AUTHENTICATION_CLASSES`)
- Test: `backend/src/contexts/identity/tests/test_personal_token_authentication.py`

**Interfaces:**
- Consumes: `PersonalAccessToken` de [[Task 1]] (`token_hash`, `revoked_at`, `user`, `last_used_at`).
- Produces: função `hash_token(raw_token: str) -> str` e função `generate_token() -> tuple[str, str]` (retorna `(raw_token, token_hash)`) em `personal_token_authentication.py`, reaproveitadas por [[Task 3]]. Classe `PersonalTokenAuthentication` registrada no DRF.

- [ ] **Step 1: Escrever teste da authentication class**

```python
# backend/src/contexts/identity/tests/test_personal_token_authentication.py
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import PersonalAccessToken, UserModel
from contexts.identity.infrastructure.django.personal_token_authentication import (
    generate_token,
    hash_token,
)


@pytest.fixture
def user(db):
    return UserModel.objects.create_user(
        email="pat-auth@t4e.com", password="senha-123", full_name="PAT Auth", is_active=True
    )


@pytest.fixture
def client():
    return APIClient()


def test_valid_personal_token_authenticates_user(client, user):
    raw, digest = generate_token()
    PersonalAccessToken.objects.create(user=user, token_hash=digest)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw}")
    response = client.get("/api/auth/me/")
    assert response.status_code == 200
    assert response.data["email"] == "pat-auth@t4e.com"


def test_revoked_personal_token_is_rejected(client, user):
    from django.utils import timezone

    raw, digest = generate_token()
    PersonalAccessToken.objects.create(user=user, token_hash=digest, revoked_at=timezone.now())
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw}")
    response = client.get("/api/auth/me/")
    assert response.status_code == 401


def test_unknown_personal_token_is_rejected(client):
    client.credentials(HTTP_AUTHORIZATION="Bearer token-que-nao-existe")
    response = client.get("/api/auth/me/")
    assert response.status_code == 401


def test_valid_personal_token_updates_last_used_at(client, user):
    raw, digest = generate_token()
    token = PersonalAccessToken.objects.create(user=user, token_hash=digest)
    assert token.last_used_at is None
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw}")
    client.get("/api/auth/me/")
    token.refresh_from_db()
    assert token.last_used_at is not None


def test_hash_token_is_deterministic():
    assert hash_token("abc") == hash_token("abc")
    assert hash_token("abc") != hash_token("abd")
```

- [ ] **Step 2: Rodar teste, confirmar que falha**

Run: `cd backend && pytest src/contexts/identity/tests/test_personal_token_authentication.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'contexts.identity.infrastructure.django.personal_token_authentication'`

- [ ] **Step 3: Implementar**

```python
# backend/src/contexts/identity/infrastructure/django/personal_token_authentication.py
"""Autenticação DRF por token pessoal (Personal Access Token).

Convive com JWTAuthentication em DEFAULT_AUTHENTICATION_CLASSES — o DRF tenta
cada classe em ordem até uma autenticar ou todas falharem (None é "não tentou",
não é erro).
"""
import hashlib
import secrets

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

TOKEN_PREFIX = "t4e_pat_"


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_token() -> tuple[str, str]:
    """Gera (token_em_texto_puro, hash). O texto puro só existe aqui — nunca é salvo."""
    raw = TOKEN_PREFIX + secrets.token_urlsafe(32)
    return raw, hash_token(raw)


class PersonalTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        from contexts.identity.infrastructure.django.models import PersonalAccessToken

        header = request.META.get("HTTP_AUTHORIZATION", "")
        if not header.startswith("Bearer "):
            return None
        raw_token = header[len("Bearer "):].strip()
        if not raw_token.startswith(TOKEN_PREFIX):
            return None  # deixa a JWTAuthentication tentar

        digest = hash_token(raw_token)
        try:
            token = PersonalAccessToken.objects.select_related("user").get(
                token_hash=digest, revoked_at__isnull=True
            )
        except PersonalAccessToken.DoesNotExist:
            raise AuthenticationFailed("Token inválido ou revogado.")

        PersonalAccessToken.objects.filter(pk=token.pk).update(last_used_at=timezone.now())
        return (token.user, None)
```

- [ ] **Step 4: Registrar no DRF**

Editar `backend/src/config/settings/base.py:135-137`:

```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "contexts.identity.infrastructure.django.personal_token_authentication.PersonalTokenAuthentication",
    ),
```

(mantém o resto do dicionário igual — só a tupla ganha a segunda entrada)

- [ ] **Step 5: Rodar teste, confirmar que passa**

Run: `cd backend && pytest src/contexts/identity/tests/test_personal_token_authentication.py -v`
Expected: PASS (5 testes)

- [ ] **Step 6: Rodar suíte completa do identity pra garantir que JWT continua funcionando**

Run: `cd backend && pytest src/contexts/identity/ -v`
Expected: PASS (todos, incluindo os testes já existentes de `test_profile_api.py`)

- [ ] **Step 7: Commit**

```bash
git add backend/src/contexts/identity/infrastructure/django/personal_token_authentication.py \
  backend/src/contexts/identity/tests/test_personal_token_authentication.py \
  backend/src/config/settings/base.py
git commit -m "feat(identity): adiciona PersonalTokenAuthentication"
```

---

### Task 3: Endpoints de gerar/listar/revogar token

**Files:**
- Modify: `backend/src/contexts/identity/interface/api/serializers.py` (adicionar serializers no final)
- Modify: `backend/src/contexts/identity/interface/api/views.py` (adicionar views no final, e imports no topo)
- Modify: `backend/src/contexts/identity/interface/api/urls.py` (adicionar 2 rotas)
- Test: `backend/src/contexts/identity/tests/test_personal_access_token_api.py`

**Interfaces:**
- Consumes: `PersonalAccessToken` de [[Task 1]]; `generate_token()` de [[Task 2]].
- Produces: `POST /api/auth/tokens/` (name: 'personal-token-create'), `GET /api/auth/tokens/` (mesma view, name compartilhado com create), `DELETE /api/auth/tokens/<uuid:token_id>/` (name: 'personal-token-revoke').

- [ ] **Step 1: Escrever teste da API**

```python
# backend/src/contexts/identity/tests/test_personal_access_token_api.py
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import PersonalAccessToken, UserModel
from contexts.identity.infrastructure.django.personal_token_authentication import hash_token


@pytest.fixture
def user(db):
    return UserModel.objects.create_user(
        email="pat-api@t4e.com", password="senha-123", full_name="PAT API", is_active=True
    )


@pytest.fixture
def other_user(db):
    return UserModel.objects.create_user(
        email="other@t4e.com", password="senha-123", full_name="Other", is_active=True
    )


@pytest.fixture
def client(user):
    api = APIClient()
    api.force_authenticate(user)
    return api


def test_create_token_returns_raw_value_once(client, user):
    response = client.post("/api/auth/tokens/", {"name": "Claude Desktop"}, format="json")
    assert response.status_code == 201
    assert response.data["name"] == "Claude Desktop"
    assert response.data["token"].startswith("t4e_pat_")
    stored = PersonalAccessToken.objects.get(user=user)
    assert stored.token_hash == hash_token(response.data["token"])


def test_create_token_without_name_is_allowed(client):
    response = client.post("/api/auth/tokens/", {}, format="json")
    assert response.status_code == 201
    assert response.data["name"] == ""


def test_list_tokens_never_exposes_raw_value(client, user):
    client.post("/api/auth/tokens/", {"name": "CI"}, format="json")
    response = client.get("/api/auth/tokens/")
    assert response.status_code == 200
    assert len(response.data) == 1
    assert "token" not in response.data[0]
    assert response.data[0]["name"] == "CI"


def test_list_tokens_only_shows_own_tokens(client, user, other_user):
    PersonalAccessToken.objects.create(user=other_user, token_hash="c" * 64, name="Não é meu")
    response = client.get("/api/auth/tokens/")
    assert response.status_code == 200
    assert response.data == []


def test_revoke_token_sets_revoked_at(client, user):
    created = client.post("/api/auth/tokens/", {"name": "Temp"}, format="json")
    token_id = created.data["id"]
    response = client.delete(f"/api/auth/tokens/{token_id}/")
    assert response.status_code == 204
    stored = PersonalAccessToken.objects.get(id=token_id)
    assert stored.revoked_at is not None


def test_revoke_token_of_another_user_fails(client, other_user):
    token = PersonalAccessToken.objects.create(user=other_user, token_hash="d" * 64)
    response = client.delete(f"/api/auth/tokens/{token.id}/")
    assert response.status_code == 404
    token.refresh_from_db()
    assert token.revoked_at is None
```

- [ ] **Step 2: Rodar teste, confirmar que falha**

Run: `cd backend && pytest src/contexts/identity/tests/test_personal_access_token_api.py -v`
Expected: FAIL — 404 (rota não existe)

- [ ] **Step 3: Adicionar serializers**

Adicionar no final de `backend/src/contexts/identity/interface/api/serializers.py`:

```python
class CreatePersonalAccessTokenSerializer(serializers.Serializer):
    """Payload de criação de token pessoal."""

    name = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")


class PersonalAccessTokenSerializer(serializers.Serializer):
    """Representação pública de um token — nunca inclui o valor bruto."""

    id = serializers.CharField()
    name = serializers.CharField()
    created_at = serializers.DateTimeField()
    last_used_at = serializers.DateTimeField(allow_null=True)


class PersonalAccessTokenCreatedSerializer(PersonalAccessTokenSerializer):
    """Só usada na resposta do POST — única vez que o token bruto é exposto."""

    token = serializers.CharField()
```

- [ ] **Step 4: Adicionar views**

Adicionar import no topo de `backend/src/contexts/identity/interface/api/views.py` (junto aos demais imports de `serializers`):

```python
from contexts.identity.interface.api.serializers import (
    ChangePasswordSerializer,
    CreatePersonalAccessTokenSerializer,
    CreateWorkspaceSerializer,
    PersonalAccessTokenCreatedSerializer,
    PersonalAccessTokenSerializer,
    RegisterSerializer,
    UserSerializer,
    WorkspaceListItemSerializer,
    WorkspaceSerializer,
)
```

E este import junto aos demais de `infrastructure.django`:

```python
from contexts.identity.infrastructure.django.personal_token_authentication import generate_token
```

Adicionar no final de `views.py`:

```python
class PersonalAccessTokenListCreateView(APIView):
    """Lista e gera tokens pessoais do usuário autenticado."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        from contexts.identity.infrastructure.django.models import PersonalAccessToken

        tokens = PersonalAccessToken.objects.filter(
            user=request.user, revoked_at__isnull=True
        ).order_by("-created_at")
        return Response(PersonalAccessTokenSerializer(tokens, many=True).data)

    def post(self, request: Request) -> Response:
        from contexts.identity.infrastructure.django.models import PersonalAccessToken

        serializer = CreatePersonalAccessTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        raw_token, digest = generate_token()
        token = PersonalAccessToken.objects.create(
            user=request.user, name=serializer.validated_data["name"], token_hash=digest
        )
        data = PersonalAccessTokenCreatedSerializer(token).data
        data["token"] = raw_token
        return Response(data, status=status.HTTP_201_CREATED)


class PersonalAccessTokenRevokeView(APIView):
    """Revoga um token pessoal do próprio usuário."""

    permission_classes = [IsAuthenticated]

    def delete(self, request: Request, token_id: str) -> Response:
        from contexts.identity.infrastructure.django.models import PersonalAccessToken

        token = PersonalAccessToken.objects.filter(
            id=token_id, user=request.user, revoked_at__isnull=True
        ).first()
        if not token:
            return Response(status=status.HTTP_404_NOT_FOUND)
        token.revoked_at = timezone.now()
        token.save(update_fields=["revoked_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
```

Adicionar import de `timezone` no topo do arquivo (junto aos imports do `django`), se ainda não existir:

```python
from django.utils import timezone
```

- [ ] **Step 5: Registrar rotas**

Editar `backend/src/contexts/identity/interface/api/urls.py` — adicionar ao import de `views`:

```python
from contexts.identity.interface.api.views import (
    ChangePasswordView,
    ForgotPasswordView,
    GoogleLoginCallbackView,
    GoogleLoginUrlView,
    MeView,
    PersonalAccessTokenListCreateView,
    PersonalAccessTokenRevokeView,
    RegisterView,
    ResetPasswordView,
    TokenRefreshSafeView,
    VerifyEmailView,
    WorkspaceCreateView,
)
```

E adicionar em `urlpatterns`, após a linha `path("me/change-password/", ...)`:

```python
    path("tokens/", PersonalAccessTokenListCreateView.as_view(), name="personal-token-list-create"),
    path("tokens/<uuid:token_id>/", PersonalAccessTokenRevokeView.as_view(), name="personal-token-revoke"),
```

- [ ] **Step 6: Rodar teste, confirmar que passa**

Run: `cd backend && pytest src/contexts/identity/tests/test_personal_access_token_api.py -v`
Expected: PASS (6 testes)

- [ ] **Step 7: Rodar suíte completa do backend**

Run: `cd backend && pytest -q`
Expected: PASS (nenhuma regressão)

- [ ] **Step 8: Commit**

```bash
git add backend/src/contexts/identity/interface/api/serializers.py \
  backend/src/contexts/identity/interface/api/views.py \
  backend/src/contexts/identity/interface/api/urls.py \
  backend/src/contexts/identity/tests/test_personal_access_token_api.py
git commit -m "feat(identity): endpoints de gerar/listar/revogar token pessoal"
```

---

### Task 4: Frontend — `tokens.api.ts` e hooks react-query

**Files:**
- Create: `frontend/src/features/tokens/tokens.types.ts`
- Create: `frontend/src/features/tokens/tokens.api.ts`
- Create: `frontend/src/features/tokens/tokens.hooks.ts`

**Interfaces:**
- Consumes: rotas de [[Task 3]] (`POST/GET /api/auth/tokens/`, `DELETE /api/auth/tokens/<id>/`) e `api`/`extractApiError` de `@/shared/api/client`.
- Produces: `PersonalToken` type; `listTokens()`, `createToken(name?: string)`, `revokeToken(id: string)`; hooks `useTokens()`, `useCreateToken()`, `useRevokeToken()`, consumidos por [[Task 5]].

- [ ] **Step 1: Criar os types**

```typescript
// frontend/src/features/tokens/tokens.types.ts
export interface PersonalToken {
  id: string
  name: string
  created_at: string
  last_used_at: string | null
}

export interface PersonalTokenCreated extends PersonalToken {
  token: string
}
```

- [ ] **Step 2: Criar o client de API**

```typescript
// frontend/src/features/tokens/tokens.api.ts
import { api } from "@/shared/api/client"

import type { PersonalToken, PersonalTokenCreated } from "./tokens.types"

export async function listTokens(): Promise<PersonalToken[]> {
  const { data } = await api.get<PersonalToken[]>("/auth/tokens/")
  return data
}

export async function createToken(name?: string): Promise<PersonalTokenCreated> {
  const { data } = await api.post<PersonalTokenCreated>("/auth/tokens/", { name: name ?? "" })
  return data
}

export async function revokeToken(id: string): Promise<void> {
  await api.delete(`/auth/tokens/${id}/`)
}
```

- [ ] **Step 3: Criar os hooks**

```typescript
// frontend/src/features/tokens/tokens.hooks.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as tokensApi from "./tokens.api"

export function useTokens() {
  return useQuery({ queryKey: ["personal-tokens"], queryFn: tokensApi.listTokens })
}

export function useCreateToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name?: string) => tokensApi.createToken(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal-tokens"] }),
  })
}

export function useRevokeToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tokensApi.revokeToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal-tokens"] }),
  })
}
```

- [ ] **Step 4: Verificar compilação TypeScript**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros nos 3 arquivos novos (podem existir erros pré-existentes em outras partes do projeto — não é escopo desta task; se o comando já falhava antes desta task, ignore erros não relacionados a `features/tokens`)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/tokens/
git commit -m "feat(tokens): client de API e hooks react-query pra tokens pessoais"
```

---

### Task 5: Frontend — seção "Tokens de API" em Configurações

**Files:**
- Modify: `frontend/src/features/profile/ProfileSettingsPage.tsx`

**Interfaces:**
- Consumes: `useTokens`, `useCreateToken`, `useRevokeToken` de [[Task 4]]; `Modal`, `Card` (definido no próprio arquivo), `Button`, `Field`, `Input` de `@/shared/ui/primitives`; `toast` de `@/shared/ui/toast`.

- [ ] **Step 1: Adicionar o tipo de seção e o item de navegação**

Em `frontend/src/features/profile/ProfileSettingsPage.tsx:19`, trocar:

```typescript
type Section = "profile" | "preferences" | "security"
```

por:

```typescript
type Section = "profile" | "preferences" | "security" | "tokens"
```

Em `frontend/src/features/profile/ProfileSettingsPage.tsx:21-25`, adicionar ao array `sections` (após o item `security`):

```typescript
const sections = [
  { id: "profile" as const, label: "Perfil", description: "Identidade e apresentação", icon: CircleUserRound },
  { id: "preferences" as const, label: "Preferências", description: "Aparência e notificações", icon: Palette },
  { id: "security" as const, label: "Segurança", description: "Acesso e senha", icon: ShieldCheck },
  { id: "tokens" as const, label: "Tokens de API", description: "Acesso de integrações externas", icon: KeyRound },
]
```

- [ ] **Step 2: Renderizar a nova seção**

Em `frontend/src/features/profile/ProfileSettingsPage.tsx:151`, após a linha `{section === "security" && ...}`, adicionar:

```typescript
          {section === "tokens" && <TokensSection />}
```

- [ ] **Step 3: Adicionar imports necessários**

No topo do arquivo, adicionar `Copy` e `Plus` aos imports de `lucide-react` (linha 3-7) e importar os hooks:

```typescript
import {
  Bell, Camera, Check, ChevronRight, CircleUserRound, Copy,
  KeyRound, LockKeyhole, Mail, Palette, Plus, Save,
  ShieldCheck, Sparkles, Trash2, UserRound,
} from "lucide-react"
```

```typescript
import { useCreateToken, useRevokeToken, useTokens } from "@/features/tokens/tokens.hooks"
import { Modal } from "@/shared/ui/primitives"
```

(o `Modal` entra junto ao import já existente de `Button, Field, Input, Select, Textarea, cx` na linha 15 — vira `Button, Field, Input, Modal, Select, Textarea, cx`)

- [ ] **Step 4: Implementar o componente `TokensSection`**

Adicionar no final do arquivo (após `SecuritySection`):

```typescript
function TokensSection() {
  const { data: tokens, isLoading } = useTokens()
  const createToken = useCreateToken()
  const revokeToken = useRevokeToken()
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState("")
  const [createdToken, setCreatedToken] = useState<string | null>(null)

  const handleCreate = async () => {
    try {
      const result = await createToken.mutateAsync(name.trim() || undefined)
      setCreatedToken(result.token)
      setName("")
    } catch (error) {
      toast.error(extractApiError(error))
    }
  }

  const handleRevoke = async (id: string) => {
    try {
      await revokeToken.mutateAsync(id)
      toast.success("Token revogado.")
    } catch (error) {
      toast.error(extractApiError(error))
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setCreatedToken(null)
    setName("")
  }

  const copyToken = async () => {
    if (!createdToken) return
    await navigator.clipboard.writeText(createdToken)
    toast.success("Token copiado.")
  }

  return (
    <div className="space-y-5">
      <Card
        title="Tokens de API"
        description="Use um token pessoal pra conectar integrações externas (ex.: Claude via MCP) com sua conta."
        icon={KeyRound}
        footer={<Button icon={<Plus className="size-4" />} onClick={() => setModalOpen(true)}>Gerar novo token</Button>}
      >
        {isLoading && <p className="text-sm text-paper-500">Carregando...</p>}
        {!isLoading && (tokens?.length ?? 0) === 0 && (
          <p className="text-sm text-paper-500">Nenhum token gerado ainda.</p>
        )}
        {!isLoading && tokens && tokens.length > 0 && (
          <div className="divide-y divide-paper-100 dark:divide-ink-800">
            {tokens.map((token) => (
              <div key={token.id} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink dark:text-paper">{token.name || "Sem nome"}</p>
                  <p className="text-xs text-paper-500">
                    Criado em {new Date(token.created_at).toLocaleDateString("pt-BR")}
                    {token.last_used_at
                      ? ` · último uso em ${new Date(token.last_used_at).toLocaleDateString("pt-BR")}`
                      : " · nunca usado"}
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 className="size-4" />}
                  loading={revokeToken.isPending}
                  onClick={() => handleRevoke(token.id)}
                >
                  Revogar
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={createdToken ? "Token gerado" : "Gerar novo token"}
        description={createdToken ? "Copie agora — ele não será mostrado de novo." : "Dê um nome pra reconhecer onde esse token vai ser usado."}
        footer={
          createdToken ? (
            <Button onClick={closeModal}>Fechar</Button>
          ) : (
            <Button loading={createToken.isPending} icon={<Plus className="size-4" />} onClick={handleCreate}>
              Gerar token
            </Button>
          )
        }
      >
        {createdToken ? (
          <div className="flex items-center gap-2 rounded-xl border border-paper-200 bg-paper-50 p-3 dark:border-ink-700 dark:bg-ink-950/40">
            <code className="flex-1 truncate text-xs text-ink dark:text-paper">{createdToken}</code>
            <Button variant="ghost" size="sm" icon={<Copy className="size-4" />} onClick={copyToken}>Copiar</Button>
          </div>
        ) : (
          <Field label="Nome (opcional)">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Claude Desktop" />
          </Field>
        )}
      </Modal>
    </div>
  )
}
```

- [ ] **Step 5: Adicionar `useState` ao import de `react` se necessário**

Confirmar que `frontend/src/features/profile/ProfileSettingsPage.tsx:8` já importa `useState` (`import { useEffect, useRef, useState } from "react"`) — já importa, nenhuma mudança necessária aqui.

- [ ] **Step 6: Testar manualmente no navegador**

Rodar o frontend local (`cd frontend && npm run dev`) e o backend local, logar, ir em Configurações → Tokens de API, gerar um token, confirmar que aparece uma única vez, fechar o modal, confirmar que a lista mostra o token sem o valor, clicar em Revogar e confirmar que some da lista.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/profile/ProfileSettingsPage.tsx
git commit -m "feat(profile): seção Tokens de API em Configurações"
```

---

### Task 6: `mcp-server` — migrar de stdio+credenciais pra HTTP+bearer repassado

**Files:**
- Modify: `mcp-server/server.py` (reescrita quase completa)
- Modify: `mcp-server/.env.example`
- Delete: `mcp-server/.env` (continha credencial de teste da Task anterior — não deve ir pro git; confirmar que já está no `.gitignore`, criado antes)

**Interfaces:**
- Produces: mesmas 3 tools (`list_workspaces`, `list_projects`, `create_card`) com assinatura idêntica à validada manualmente — só a função `_request` interna muda de estratégia de auth (repassa o Bearer da requisição MCP em vez de logar com email/senha).

Esta etapa não tem framework de teste automatizado no `mcp-server` (é um script Python solto, não uma app com suíte pytest própria) — a verificação é manual, replicando o fluxo já validado na Task 6.

- [ ] **Step 1: Reescrever `server.py`**

```python
# mcp-server/server.py
"""MCP server remoto do t4e-office: cria/lista cards via a API HTTP existente.

Não guarda nenhuma credencial. Cada chamada MCP chega com o Bearer token
pessoal do usuário (gerado em Configurações -> Tokens de API no office); este
servidor só repassa esse header pra API Django, que autentica via
PersonalTokenAuthentication e aplica as capabilities normais do usuário.
"""

import os

import httpx
from mcp.server.fastmcp import Context, FastMCP

BASE_URL = os.environ.get("T4E_API_URL", "http://web:8000")

mcp = FastMCP("t4e-office", host="0.0.0.0", port=8000)


def _bearer_from(ctx: Context) -> str:
    request = ctx.request_context.request
    header = request.headers.get("authorization", "") if request else ""
    if not header.startswith("Bearer "):
        raise ValueError("Requisição sem token de autenticação (Authorization: Bearer <token>).")
    return header


def _request(ctx: Context, method: str, path: str, **kwargs) -> dict:
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = _bearer_from(ctx)
    r = httpx.request(method, f"{BASE_URL}{path}", headers=headers, timeout=15, **kwargs)
    r.raise_for_status()
    return r.json() if r.content else {}


@mcp.tool()
def list_workspaces(ctx: Context) -> list[dict]:
    """Lista os workspaces do usuário autenticado (id, name, slug)."""
    me = _request(ctx, "GET", "/api/auth/me/")
    return me.get("workspaces", [])


@mcp.tool()
def list_projects(workspace_id: str, ctx: Context) -> list[dict]:
    """Lista projetos de um workspace (retorna id, name, key)."""
    return _request(ctx, "GET", "/api/projects/", params={"workspace_id": workspace_id})


@mcp.tool()
def create_card(
    project_id: str,
    title: str,
    ctx: Context,
    description: str = "",
    status: str = "todo",
    type: str = "feature",
    priority: str = "medium",
    labels: list[str] | None = None,
) -> dict:
    """Cria um card em um projeto do t4e-office.

    project_id: id do projeto (obtido via list_projects).
    status: slug livre, ex. "todo", "in_progress", "done".
    type: "feature", "bug", "task", etc conforme choices do sistema.
    priority: "low", "medium", "high", etc.
    """
    payload = {
        "title": title,
        "description": description,
        "status": status,
        "type": type,
        "priority": priority,
        "labels": labels or [],
    }
    return _request(ctx, "POST", f"/api/projects/{project_id}/cards/", json=payload)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
```

- [ ] **Step 2: Atualizar `.env.example`**

```
# mcp-server/.env.example
T4E_API_URL=http://web:8000
```

(`T4E_EMAIL`/`T4E_PASSWORD` saem — não existem mais nesta versão)

- [ ] **Step 3: Remover o `.env` de teste local**

Run: `rm -f mcp-server/.env`

Confirmar que `mcp-server/.gitignore` (já existe, criado antes) segue ignorando `.env`.

- [ ] **Step 4: Testar localmente end-to-end com token real**

Com o backend local rodando (`docker compose up` em `backend/`) e um token pessoal já gerado via [[Task 5]] (ou via `curl` direto no endpoint de [[Task 3]]):

```bash
cd mcp-server
T4E_API_URL=http://localhost:8000 ./.venv/bin/python3 server.py &
sleep 2
curl -s -X POST http://localhost:8000/mcp \
  -H "Authorization: Bearer <token gerado>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: resposta JSON-RPC listando as 3 tools (`list_workspaces`, `list_projects`, `create_card`). Encerrar o processo em background depois (`kill %1`).

- [ ] **Step 5: Adicionar `mcp-server/requirements.txt`**

```
# mcp-server/requirements.txt
mcp<2
httpx
```

- [ ] **Step 6: Commit**

```bash
git add mcp-server/server.py mcp-server/.env.example mcp-server/requirements.txt
git commit -m "feat(mcp-server): migra de stdio+credenciais pra HTTP com bearer repassado"
```

---

### Task 7: `mcp-server` — Dockerfile

**Files:**
- Create: `mcp-server/Dockerfile`

**Interfaces:**
- Consumes: `mcp-server/requirements.txt` e `mcp-server/server.py` de [[Task 6]].
- Produces: imagem Docker consumida por [[Task 8]] (`docker-compose.prod.yml`, `build: { context: ../mcp-server }`).

- [ ] **Step 1: Criar o Dockerfile**

```dockerfile
# mcp-server/Dockerfile
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

COPY server.py ./

EXPOSE 8000
CMD ["python", "server.py"]
```

- [ ] **Step 2: Testar build local**

Run: `cd mcp-server && docker build -t t4e-mcp-server-test .`
Expected: build sem erros

- [ ] **Step 3: Testar o container rodando isolado**

```bash
docker run --rm -d --name mcp-test -p 8010:8000 -e T4E_API_URL=http://host.docker.internal:8000 t4e-mcp-server-test
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8010/mcp
docker stop mcp-test
```

Expected: algum código HTTP de resposta (400/406 sem headers corretos é esperado — o importante é o container estar de pé e escutando, não um handshake completo)

- [ ] **Step 4: Commit**

```bash
git add mcp-server/Dockerfile
git commit -m "feat(mcp-server): adiciona Dockerfile"
```

---

### Task 8: Deploy em produção — subdomínio, Traefik, novo serviço

Esta task mexe em arquivos que **não estão no git** — `deploy/docker-compose.prod.yml`, `deploy/dynamic.yml` e `deploy/.env` existem só no servidor (`root@179.198.122.25:/opt/t4e-office/deploy/`), fora de controle de versão (contêm segredos). As mudanças são feitas via SSH direto, não via commit.

**Pré-requisito (fora do escopo automatizável — pedir pro usuário):** criar um registro DNS tipo A apontando `mcp.t4egroup.com.br` pro IP `179.198.122.25` (mesmo provedor onde `office.t4egroup.com.br` já está configurado, comentário em `traefik.yml` do servidor menciona cPanel da HostGator). Sem isso o desafio HTTP-01 do Let's Encrypt falha e não sai certificado.

**Files (no servidor, via SSH):**
- Modify: `/opt/t4e-office/deploy/docker-compose.prod.yml` (novo serviço `mcp`)
- Modify: `/opt/t4e-office/deploy/dynamic.yml` (novo router `mcp`)
- Modify: `/opt/t4e-office/deploy/.env` (adicionar `web` em `ALLOWED_HOSTS`, pra requisição interna do `mcp-server` não ser rejeitada pelo Django)

**Interfaces:**
- Consumes: imagem buildada de [[Task 7]] (`mcp-server/Dockerfile`), já disponível em `/opt/t4e-office/mcp-server/` depois do `git pull` no servidor (as Tasks 1-7 tem que estar commitadas e no branch que o servidor puxa).

- [ ] **Step 1: Confirmar DNS propagado**

Run: `dig +short mcp.t4egroup.com.br`
Expected: retorna `179.198.122.25`. Se não retornar nada, parar aqui e pedir pro usuário configurar o DNS antes de continuar — o resto da task depende disso pro Let's Encrypt funcionar.

- [ ] **Step 2: Atualizar `ALLOWED_HOSTS` no `.env` do servidor**

Via SSH:

```bash
ssh root@179.198.122.25
cd /opt/t4e-office/deploy
sed -i 's/^ALLOWED_HOSTS=.*/ALLOWED_HOSTS=office.t4egroup.com.br,web/' .env
grep '^ALLOWED_HOSTS=' .env
```

Expected: `ALLOWED_HOSTS=office.t4egroup.com.br,web`

(o `web` é o hostname interno do container Django dentro da rede Docker — é o `Host` header que a chamada do `mcp-server` vai carregar ao bater em `http://web:8000`, já que ela não passa pelo Traefik)

- [ ] **Step 3: Adicionar o serviço `mcp` ao `docker-compose.prod.yml`**

No servidor, editar `/opt/t4e-office/deploy/docker-compose.prod.yml`, adicionando este bloco na seção `services:` (logo após o serviço `web`):

```yaml
  mcp:
    build:
      context: ../mcp-server
    restart: unless-stopped
    environment:
      T4E_API_URL: http://web:8000
    depends_on:
      - web
```

- [ ] **Step 4: Adicionar o router no `dynamic.yml`**

No servidor, editar `/opt/t4e-office/deploy/dynamic.yml`, adicionando em `http.routers`:

```yaml
    mcp:
      rule: "Host(`mcp.t4egroup.com.br`)"
      entryPoints: [websecure]
      service: mcp
      priority: 50
      tls:
        certResolver: le
```

E em `http.services`:

```yaml
    mcp:
      loadBalancer:
        servers:
          - url: "http://mcp:8000"
```

- [ ] **Step 5: Atualizar o código no servidor e subir o novo serviço**

```bash
cd /opt/t4e-office
git pull origin main
cd deploy
docker compose -f docker-compose.prod.yml up -d --build mcp
docker compose -f docker-compose.prod.yml restart traefik web
```

- [ ] **Step 6: Verificar que o serviço subiu**

```bash
docker compose -f docker-compose.prod.yml ps mcp
docker compose -f docker-compose.prod.yml logs mcp --tail 30
```

Expected: container `Up`, logs mostrando o servidor MCP escutando (uvicorn startup), sem traceback.

- [ ] **Step 7: Testar HTTPS externo com um token real**

De fora do servidor (máquina local), gerando um token real via `POST https://office.t4egroup.com.br/api/auth/tokens/` autenticado (ou pela tela de Configurações já em prod):

```bash
curl -s -X POST https://mcp.t4egroup.com.br/mcp \
  -H "Authorization: Bearer <token real>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: certificado HTTPS válido (sem `-k`), resposta JSON-RPC com as 3 tools.

- [ ] **Step 8: Testar `create_card` real via MCP em prod**

Repetir o teste do Step 7 trocando o `method` por `tools/call`, `params: {"name": "create_card", "arguments": {"project_id": "<um id real de projeto>", "title": "Teste deploy MCP prod"}}`. Confirmar no board do projeto em `https://office.t4egroup.com.br` que o card foi criado.

Este step **não tem commit** — é validação operacional em produção.

---

### Task 9: Documentação de uso pra equipe

**Files:**
- Modify: `mcp-server/README.md` (criar, não existe ainda)

**Interfaces:**
- Nenhuma — task de documentação, sem código.

- [ ] **Step 1: Escrever o README**

```markdown
# mcp-server/README.md

# MCP do t4e-office

Servidor MCP remoto que permite criar/listar cards do t4e-office direto pelo
Claude (chat ou terminal), sem precisar abrir o navegador.

## Como conectar

1. Loga no office (`https://office.t4egroup.com.br`), vai em
   **Configurações → Tokens de API → Gerar novo token**. Copia o valor —
   ele só aparece uma vez.
2. No Claude, adiciona um servidor MCP remoto:
   - URL: `https://mcp.t4egroup.com.br/mcp`
   - Autenticação: cola o token copiado (header `Authorization: Bearer <token>`)
3. Pronto. Pede algo tipo "cria um card X no projeto Y" e o Claude usa a
   ferramenta `create_card` direto.

## Revogar acesso

Voltando em Configurações → Tokens de API, dá pra revogar qualquer token a
qualquer momento — sem precisar de ninguém do time técnico.

## Ferramentas disponíveis

- `list_workspaces` — lista os workspaces do usuário dono do token
- `list_projects(workspace_id)` — lista projetos de um workspace
- `create_card(project_id, title, description?, status?, type?, priority?, labels?)`
  — cria um card

## Desenvolvimento local

```bash
cd mcp-server
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
T4E_API_URL=http://localhost:8000 ./.venv/bin/python3 server.py
```
```

- [ ] **Step 2: Commit**

```bash
git add mcp-server/README.md
git commit -m "docs(mcp-server): README de uso pra equipe"
```

---

## Self-Review

**Cobertura do spec:** modelo/hash/geração (§1 do spec) → Task 1-2; endpoints criar/listar/revogar (§3) → Task 3; tela de Configurações (§4) → Task 4-5; servidor MCP HTTP + repasse de bearer (§5) → Task 6; infra/subdomínio/Docker (§6) → Task 7-8; testes unitários/integração/manual (seção "Testes" do spec) → cobertos em cada task; documentação de uso → Task 9. Nenhum requisito do spec ficou sem task correspondente.

**Placeholders:** nenhum "TBD"/"implementar depois" no plano — todo step de código tem o código completo.

**Consistência de tipos:** `PersonalToken`/`PersonalTokenCreated` (frontend) batem com `PersonalAccessTokenSerializer`/`PersonalAccessTokenCreatedSerializer` (backend) campo a campo (`id`, `name`, `created_at`, `last_used_at`, e `token` só no created). Assinaturas das 3 tools MCP idênticas entre Task 6 e o que já foi validado manualmente antes deste plano.
