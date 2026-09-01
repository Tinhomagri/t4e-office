# OAuth pro Conector MCP (claude.ai Connectors) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o `mcp-server` suportar o fluxo OAuth exigido pela tela
"Connectors" do claude.ai (nível organização), sem quebrar o fluxo manual
já existente (Claude Code/Desktop com Bearer colado).

**Architecture:** Proxy OAuth — `mcp-server` é o servidor de autorização
pro lado do Claude (usando o `OAuthAuthorizationServerProvider` já
embutido no pacote `mcp`), delegando login/consentimento pro backend
Django do office. O token final entregue ao Claude é literalmente um
`PersonalAccessToken` (mesmo mecanismo de Configurações → Tokens de API)
— sem sistema de auth paralelo, sem tabela de token nova.

**Tech Stack:** Django + DRF (backend), React + TS (frontend), Python
`mcp`/FastMCP SDK (`mcp-server`), comunicação server-to-server via header
`X-Internal-Secret`.

**Spec:** `docs/superpowers/specs/2026-09-01-mcp-oauth-connector-design.md`

## Global Constraints

- O access_token final é sempre um `PersonalAccessToken` já existente —
  nunca criar uma segunda tabela de token com semântica paralela.
- Endpoints server-to-server (`token-exchange`, `revoke-by-value`) exigem
  header `X-Internal-Secret` batendo com `OAUTH_INTERNAL_SECRET` (env var,
  igual em `web` e `mcp`) — 403 sem ele ou errado.
- `POST /api/oauth/clients/` (registro dinâmico) é intencionalmente sem
  autenticação — é assim que RFC 7591 funciona.
- `POST /api/oauth/authorize-code/` exige sessão de usuário logado
  (autenticação normal do office — JWT/cookie, não o segredo interno).
- Nenhum refresh token — PAT não expira, `load_refresh_token`/
  `exchange_refresh_token` do provider não são implementados.
- Todo endpoint novo vai em `contexts/identity/interface/api/oauth_views.py`
  (arquivo novo) — não misturar com `views.py` existente do contexto.

---

### Task 1: Models `OAuthClientModel` e `OAuthAuthorizationCodeModel` + migration

**Files:**
- Modify: `backend/src/contexts/identity/infrastructure/django/models.py`
- Create: `backend/src/contexts/identity/migrations/00XX_oauth_client_and_code.py` (gerado via `makemigrations`, número real depende do estado atual)
- Test: `backend/src/contexts/identity/tests/test_oauth_models.py`

**Interfaces:**
- Produces: `OAuthClientModel` (`client_id` PK str, `client_name` str,
  `redirect_uris` JSONField list, `created_at`), `OAuthAuthorizationCodeModel`
  (`code` PK str, `client_id` str, `user` FK, `redirect_uri` URLField,
  `used_at` nullable datetime, `created_at`, `expires_at`) — usados pela
  Task 2.

- [ ] **Step 1: Escrever teste de criação dos models**

```python
# backend/src/contexts/identity/tests/test_oauth_models.py
import pytest
from django.utils import timezone
from datetime import timedelta

from contexts.identity.infrastructure.django.models import (
    OAuthAuthorizationCodeModel,
    OAuthClientModel,
    UserModel,
)


@pytest.fixture
def user(db):
    return UserModel.objects.create_user(
        email="oauth@t4e.com", password="x", full_name="OAuth User", is_active=True
    )


def test_oauth_client_criacao_basica(db):
    client = OAuthClientModel.objects.create(
        client_id="abc123",
        client_name="Claude",
        redirect_uris=["https://claude.ai/api/mcp/callback"],
    )
    assert client.client_id == "abc123"
    assert client.redirect_uris == ["https://claude.ai/api/mcp/callback"]


def test_oauth_authorization_code_vinculado_a_usuario(user):
    code = OAuthAuthorizationCodeModel.objects.create(
        code="deadbeef",
        client_id="abc123",
        user=user,
        redirect_uri="https://mcp.t4egroup.com.br/oauth/django-callback",
        expires_at=timezone.now() + timedelta(minutes=2),
    )
    assert code.used_at is None
    assert code.user_id == user.id
```

- [ ] **Step 2: Rodar o teste, confirmar que falha (models não existem)**

Run: `.venv/bin/python -m pytest src/contexts/identity/tests/test_oauth_models.py -q`
Expected: FAIL com `ImportError` (models não existem ainda).

- [ ] **Step 3: Adicionar os models**

Em `backend/src/contexts/identity/infrastructure/django/models.py`, no
final do arquivo (mesmo padrão de `PersonalAccessToken` já existente
nesse arquivo — `id`/PK explícito, `db_table` opcional se o padrão do
arquivo usar):

```python
class OAuthClientModel(models.Model):
    """Client registrado via RFC 7591 (registro dinâmico) pro conector
    MCP do office — hoje só o claude.ai se registra aqui."""

    client_id = models.CharField(max_length=64, primary_key=True)
    client_name = models.CharField(max_length=200, blank=True)
    redirect_uris = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)


class OAuthAuthorizationCodeModel(models.Model):
    """Código de autorização de curta duração, emitido depois que o
    usuário permite o conector na tela /oauth/consent. Trocado uma
    única vez pelo mcp-server por um PersonalAccessToken."""

    code = models.CharField(max_length=128, primary_key=True)
    client_id = models.CharField(max_length=64)
    user = models.ForeignKey(
        "identity.UserModel", on_delete=models.CASCADE, related_name="oauth_codes"
    )
    redirect_uri = models.URLField(max_length=500)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
```

- [ ] **Step 4: Gerar e aplicar a migration**

Run (dentro de `backend/`): `.venv/bin/python manage.py makemigrations identity`
Expected: migration nova criada, sem erros.

- [ ] **Step 5: Rodar o teste, confirmar que passa**

Run: `.venv/bin/python -m pytest src/contexts/identity/tests/test_oauth_models.py -q`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/src/contexts/identity/infrastructure/django/models.py backend/src/contexts/identity/migrations/ backend/src/contexts/identity/tests/test_oauth_models.py
git commit -m "feat(identity): models OAuthClientModel e OAuthAuthorizationCodeModel"
```

---

### Task 2: Endpoints `/api/oauth/...`

**Files:**
- Create: `backend/src/contexts/identity/interface/api/oauth_views.py`
- Create: `backend/src/contexts/identity/interface/api/oauth_serializers.py`
- Modify: `backend/src/contexts/identity/interface/api/urls.py`
- Modify: `backend/src/config/settings/base.py` (adiciona `OAUTH_INTERNAL_SECRET`
  lido de env, default vazio só pra dev local)
- Test: `backend/src/contexts/identity/interface/api/tests/test_oauth_views.py`

**Interfaces:**
- Consumes: `OAuthClientModel`, `OAuthAuthorizationCodeModel` (Task 1),
  `PersonalAccessToken` + `generate_token()` (já existentes em
  `contexts/identity/infrastructure/django/personal_token_authentication.py`
  — reaproveitar, não duplicar).
- Produces: os 5 endpoints abaixo, consumidos pela Task 3 (frontend) e
  Task 4 (`mcp-server`).

**Endpoints exatos (ver spec pra contrato completo):**

1. `POST /api/oauth/clients/` — sem auth. Body:
   `{"client_id": str, "client_name": str, "redirect_uris": [str]}`.
   Cria ou atualiza (idempotente por `client_id`) um `OAuthClientModel`.
   201/200.

2. `GET /api/oauth/clients/<client_id>/` — sem auth. Devolve
   `{"client_id", "client_name", "redirect_uris"}` ou 404.

3. `POST /api/oauth/authorize-code/` — `IsAuthenticated` (sessão normal
   do office). Body: `{"client_id": str, "redirect_uri": str}`. Gera
   `code = secrets.token_urlsafe(32)`, cria
   `OAuthAuthorizationCodeModel(code=code, client_id=..., user=request.user,
   redirect_uri=..., expires_at=now()+2min)`. Devolve `{"code": code}`.

4. `POST /api/oauth/token-exchange/` — exige header `X-Internal-Secret`
   batendo com `settings.OAUTH_INTERNAL_SECRET` (403 caso contrário). Body:
   `{"code": str}`. Busca o `OAuthAuthorizationCodeModel` por `code`; 400
   se não existe, já expirou (`expires_at < now()`) ou já foi usado
   (`used_at` não nulo). Marca `used_at = now()`. Gera um
   `PersonalAccessToken` novo pro `code.user` via `generate_token()`
   (mesmo helper de `personal_token_authentication.py`), `name="Conector MCP (claude.ai)"`.
   Devolve `{"access_token": <raw>, "user_id": str(user.id), "email": user.email}`.

5. `POST /api/oauth/revoke-by-value/` — exige `X-Internal-Secret`. Body:
   `{"access_token": str}`. Faz o hash do valor recebido (mesma função de
   hash usada em `generate_token()`/`PersonalTokenAuthentication`), busca
   `PersonalAccessToken` por `token_hash`, se achar e não estiver revogado
   marca `revoked_at = now()`. Sempre 204 (idempotente, nunca erro por
   "não achou").

- [ ] **Step 1: Ler o código existente de tokens pessoais primeiro**

Antes de escrever qualquer linha, leia
`backend/src/contexts/identity/infrastructure/django/personal_token_authentication.py`
inteiro — é de lá que vem `generate_token()` (devolve `(raw, digest)`) e a
função de hash usada pra comparar um token bruto recebido contra
`token_hash` guardado. Reaproveite essas exatas funções, não reimplemente
hash de token.

- [ ] **Step 2: Escrever os testes primeiro**

```python
# backend/src/contexts/identity/interface/api/tests/test_oauth_views.py
import pytest
from datetime import timedelta
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    OAuthAuthorizationCodeModel,
    OAuthClientModel,
    PersonalAccessToken,
    UserModel,
)

SECRET = "test-internal-secret"


@pytest.fixture
def user(db):
    return UserModel.objects.create_user(
        email="oauth@t4e.com", password="x", full_name="OAuth User", is_active=True
    )


def test_register_client_e_idempotente(db):
    client = APIClient()
    payload = {"client_id": "abc", "client_name": "Claude", "redirect_uris": ["https://claude.ai/cb"]}
    r1 = client.post("/api/oauth/clients/", payload, format="json")
    r2 = client.post("/api/oauth/clients/", payload, format="json")
    assert r1.status_code in (200, 201)
    assert r2.status_code in (200, 201)
    assert OAuthClientModel.objects.filter(client_id="abc").count() == 1


def test_get_client_inexistente_e_404(db):
    client = APIClient()
    resp = client.get("/api/oauth/clients/nao-existe/")
    assert resp.status_code == 404


def test_authorize_code_exige_login(db):
    OAuthClientModel.objects.create(client_id="abc", redirect_uris=["https://x/cb"])
    client = APIClient()
    resp = client.post(
        "/api/oauth/authorize-code/",
        {"client_id": "abc", "redirect_uri": "https://mcp.t4egroup.com.br/oauth/django-callback"},
        format="json",
    )
    assert resp.status_code == 401


def test_authorize_code_gera_codigo_pro_usuario_logado(user):
    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.post(
        "/api/oauth/authorize-code/",
        {"client_id": "abc", "redirect_uri": "https://mcp.t4egroup.com.br/oauth/django-callback"},
        format="json",
    )
    assert resp.status_code == 200
    code = resp.data["code"]
    row = OAuthAuthorizationCodeModel.objects.get(code=code)
    assert row.user_id == user.id


@override_settings(OAUTH_INTERNAL_SECRET=SECRET)
def test_token_exchange_sem_segredo_e_403(user):
    row = OAuthAuthorizationCodeModel.objects.create(
        code="c1", client_id="abc", user=user, redirect_uri="https://x/cb",
        expires_at=timezone.now() + timedelta(minutes=2),
    )
    client = APIClient()
    resp = client.post("/api/oauth/token-exchange/", {"code": row.code}, format="json")
    assert resp.status_code == 403


@override_settings(OAUTH_INTERNAL_SECRET=SECRET)
def test_token_exchange_com_segredo_devolve_token_valido(user):
    row = OAuthAuthorizationCodeModel.objects.create(
        code="c2", client_id="abc", user=user, redirect_uri="https://x/cb",
        expires_at=timezone.now() + timedelta(minutes=2),
    )
    client = APIClient()
    resp = client.post(
        "/api/oauth/token-exchange/", {"code": row.code}, format="json",
        HTTP_X_INTERNAL_SECRET=SECRET,
    )
    assert resp.status_code == 200
    assert resp.data["access_token"].startswith("t4e_pat_")
    row.refresh_from_db()
    assert row.used_at is not None
    # o token devolvido tem que autenticar de verdade
    me = APIClient().get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {resp.data['access_token']}")
    assert me.status_code == 200
    assert me.data["email"] == user.email


@override_settings(OAUTH_INTERNAL_SECRET=SECRET)
def test_token_exchange_codigo_ja_usado_e_rejeitado(user):
    row = OAuthAuthorizationCodeModel.objects.create(
        code="c3", client_id="abc", user=user, redirect_uri="https://x/cb",
        expires_at=timezone.now() + timedelta(minutes=2), used_at=timezone.now(),
    )
    client = APIClient()
    resp = client.post(
        "/api/oauth/token-exchange/", {"code": row.code}, format="json",
        HTTP_X_INTERNAL_SECRET=SECRET,
    )
    assert resp.status_code == 400


@override_settings(OAUTH_INTERNAL_SECRET=SECRET)
def test_token_exchange_codigo_expirado_e_rejeitado(user):
    row = OAuthAuthorizationCodeModel.objects.create(
        code="c4", client_id="abc", user=user, redirect_uri="https://x/cb",
        expires_at=timezone.now() - timedelta(minutes=1),
    )
    client = APIClient()
    resp = client.post(
        "/api/oauth/token-exchange/", {"code": row.code}, format="json",
        HTTP_X_INTERNAL_SECRET=SECRET,
    )
    assert resp.status_code == 400


@override_settings(OAUTH_INTERNAL_SECRET=SECRET)
def test_revoke_by_value_torna_token_invalido(user):
    from contexts.identity.infrastructure.django.personal_token_authentication import generate_token
    raw, digest = generate_token()
    PersonalAccessToken.objects.create(user=user, token_hash=digest, name="teste")

    client = APIClient()
    resp = client.post(
        "/api/oauth/revoke-by-value/", {"access_token": raw}, format="json",
        HTTP_X_INTERNAL_SECRET=SECRET,
    )
    assert resp.status_code == 204
    me = APIClient().get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {raw}")
    assert me.status_code == 401


@override_settings(OAUTH_INTERNAL_SECRET=SECRET)
def test_revoke_by_value_token_inexistente_ainda_devolve_204(db):
    client = APIClient()
    resp = client.post(
        "/api/oauth/revoke-by-value/", {"access_token": "t4e_pat_naoexiste"}, format="json",
        HTTP_X_INTERNAL_SECRET=SECRET,
    )
    assert resp.status_code == 204
```

Ajuste os nomes de campo/status code se, ao ler o Step 1, achar que a
convenção real do arquivo é ligeiramente diferente (ex.: `me.data["email"]`
já foi confirmado nesta sessão em `_profile_data()`, deve bater).

- [ ] **Step 3: Rodar os testes, confirmar que falham**

Run: `.venv/bin/python -m pytest src/contexts/identity/interface/api/tests/test_oauth_views.py -q`
Expected: FAIL (endpoints não existem, 404 em tudo).

- [ ] **Step 4: Implementar `oauth_serializers.py` e `oauth_views.py`**

Serializers simples (`serializers.Serializer`, mesmo estilo do resto do
contexto — ver `contexts/identity/interface/api/serializers.py` pro
padrão exato antes de escrever). Views (`APIView`) implementando
exatamente os 5 contratos acima. Para o header do segredo interno, uma
função helper local:

```python
def _check_internal_secret(request) -> bool:
    expected = getattr(settings, "OAUTH_INTERNAL_SECRET", "")
    got = request.headers.get("X-Internal-Secret", "")
    return bool(expected) and got == expected
```

Pra `revoke-by-value`, reaproveitar a MESMA lógica de hash usada em
`PersonalTokenAuthentication.authenticate()` pra ir de token bruto →
`token_hash` (ler o arquivo do Step 1 e usar a função exata, não
reimplementar).

- [ ] **Step 5: Adicionar `OAUTH_INTERNAL_SECRET` em `settings/base.py`**

```python
OAUTH_INTERNAL_SECRET = os.environ.get("OAUTH_INTERNAL_SECRET", "")
```

(local de dev sem a env var = string vazia = `_check_internal_secret`
sempre `False` = endpoints internos sempre 403 em dev, a menos que a
pessoa exporte a variável — aceitável, esses endpoints só importam em
produção com o `mcp-server` real).

- [ ] **Step 6: Wire nas urls**

Em `backend/src/contexts/identity/interface/api/urls.py`, adicionar as 5
rotas (prefixo `oauth/`, mesmo padrão de `path()` já usado no arquivo).

- [ ] **Step 7: Rodar os testes, confirmar que passam**

Run: `.venv/bin/python -m pytest src/contexts/identity/interface/api/tests/test_oauth_views.py -q`
Expected: PASS (10 testes).

- [ ] **Step 8: Rodar a suíte completa de identity, confirmar sem regressão**

Run: `.venv/bin/python -m pytest src/contexts/identity -q`
Expected: todos passam.

- [ ] **Step 9: Commit**

```bash
git add backend/src/contexts/identity/interface/api/oauth_views.py backend/src/contexts/identity/interface/api/oauth_serializers.py backend/src/contexts/identity/interface/api/urls.py backend/src/contexts/identity/interface/api/tests/test_oauth_views.py backend/src/config/settings/base.py
git commit -m "feat(identity): endpoints /api/oauth/ pro fluxo do conector MCP"
```

---

### Task 3: Frontend — tela `/oauth/consent`

**Files:**
- Create: `frontend/src/features/oauth/OAuthConsentPage.tsx`
- Create: `frontend/src/features/oauth/oauth.api.ts`
- Modify: `frontend/src/app/router.tsx` (rota nova `/oauth/consent`, **fora**
  do layout autenticado padrão se ele redirecionar sozinho pra `/app` —
  checar como outras rotas públicas tipo login já lidam com isso antes de
  decidir onde encaixar; se o app já tem um padrão de "rota pública", seguir
  esse padrão)

**Interfaces:**
- Consumes: `GET /api/oauth/clients/<client_id>/`,
  `POST /api/oauth/authorize-code/` (Task 2).

- [ ] **Step 1: Ler o padrão de rotas públicas existente**

Antes de mexer no router, leia `frontend/src/app/router.tsx` inteiro e
identifique como a rota de login (pública, sem exigir sessão) é declarada
hoje — replicar exatamente esse padrão pra `/oauth/consent`, já que essa
página também precisa funcionar SEM sessão (mostra "faça login primeiro")
e COM sessão (mostra o consentimento).

- [ ] **Step 2: `oauth.api.ts`**

```typescript
import { api } from "@/shared/api/client"

export interface OAuthClientInfo {
  client_id: string
  client_name: string
  redirect_uris: string[]
}

export async function getOAuthClient(clientId: string): Promise<OAuthClientInfo> {
  const { data } = await api.get<OAuthClientInfo>(`/oauth/clients/${clientId}/`)
  return data
}

export async function createAuthorizationCode(
  clientId: string,
  redirectUri: string,
): Promise<{ code: string }> {
  const { data } = await api.post<{ code: string }>("/oauth/authorize-code/", {
    client_id: clientId,
    redirect_uri: redirectUri,
  })
  return data
}
```

- [ ] **Step 3: `OAuthConsentPage.tsx`**

Lê `client_id`, `redirect_uri`, `state` da query string
(`useSearchParams`, mesmo padrão de outras páginas que leem query params
neste app — checar um exemplo existente antes de escrever). Se o usuário
não estiver autenticado (mesmo hook/store já usado em outras páginas pra
checar isso, ex. `useAuthStore`), mostra um link/redireciona pro login
preservando a URL atual completa como `?redirect=` (ou o padrão que o
login já usa pra "voltar depois de logar" — checar `frontend/src/features/auth/`
antes de inventar um mecanismo novo).

Se autenticado: busca `getOAuthClient(client_id)`, mostra:
- Nome do client (`client_name`, fallback pro próprio `client_id` se vazio)
- Texto simples explicando o que está sendo autorizado ("terá acesso aos
  mesmos boards e projetos que sua conta já acessa")
- Botão **Permitir**: chama `createAuthorizationCode`, no sucesso faz
  `window.location.href = `${redirect_uri}?code=${code}&state=${state}`` (navegação real de página, não `useNavigate` do router — é uma saída pra outro host)
- Botão **Cancelar**: `window.location.href = `${redirect_uri}?error=access_denied&state=${state}``

Tratar `client_id`/`redirect_uri` ausentes na query string como erro de
página (mensagem simples, sem crashar).

- [ ] **Step 4: Rota no router**

Adicionar `/oauth/consent` apontando pra `OAuthConsentPage`, no grupo de
rotas públicas identificado no Step 1.

- [ ] **Step 5: Verificar tipos e testes**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.
Run: `npx vitest run`
Expected: sem novas falhas (não é obrigatório escrever teste de componente
pra esta página — confirmar primeiro se o padrão do repo testa páginas
assim; se não, seguir o padrão e não adicionar).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/oauth frontend/src/app/router.tsx
git commit -m "feat(oauth): tela de consentimento pro conector MCP"
```

---

### Task 4: `mcp-server` — provider OAuth + rota de callback

**Files:**
- Create: `mcp-server/oauth_provider.py`
- Modify: `mcp-server/server.py`
- Modify: `mcp-server/.env.example` (adiciona `OAUTH_INTERNAL_SECRET`,
  `OFFICE_BASE_URL` se ainda não existir uma variável equivalente — checar
  `BASE_URL`/`T4E_API_URL` já usados em `server.py` antes de criar uma nova)

**Interfaces:**
- Consumes: os 5 endpoints da Task 2.
- Produces: `FastMCP` configurado com `auth_server_provider`, consumido
  pela Task 5 (deploy/smoke test).

- [ ] **Step 1: Ler o `provider.py` do SDK inteiro**

Leia `mcp-server/.venv/lib/python3.12/site-packages/mcp/server/auth/provider.py`
completo (protocolo `OAuthAuthorizationServerProvider`, os tipos
`AuthorizationParams`/`AuthorizationCode`/`AccessToken`/`OAuthToken`) e
`mcp-server/.venv/lib/python3.12/site-packages/mcp/server/auth/settings.py`
(pra ver os campos exatos de `AuthSettings`/`ClientRegistrationOptions`/
`RevocationOptions` antes de instanciar `FastMCP`).

- [ ] **Step 2: `oauth_provider.py`**

```python
"""Provider OAuth do mcp-server — delega login/consentimento pro office,
mas o access_token final é sempre um PersonalAccessToken de verdade."""
import os
import secrets
import time

import httpx
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    OAuthAuthorizationServerProvider,
    RefreshToken,
    RegistrationError,
    TokenError,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

OFFICE_BASE_URL = os.environ.get("OFFICE_BASE_URL", "https://office.t4egroup.com.br")
INTERNAL_API_URL = os.environ.get("T4E_API_URL", "http://web:8000")
INTERNAL_SECRET = os.environ.get("OAUTH_INTERNAL_SECRET", "")
MCP_PUBLIC_URL = os.environ.get("MCP_PUBLIC_URL", "https://mcp.t4egroup.com.br")

_CODE_TTL_SECONDS = 120


class T4EOAuthProvider(OAuthAuthorizationServerProvider[AuthorizationCode, RefreshToken, AccessToken]):
    def __init__(self) -> None:
        # Estado em memória — aceitável: processo de vida longa, janela
        # entre /authorize e o callback do Django é de segundos.
        self._pending: dict[str, dict] = {}  # state interno -> {client, params}
        self._mcp_codes: dict[str, dict] = {}  # código mcp -> {django_code, params, client_id}

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        async with httpx.AsyncClient() as http:
            r = await http.get(f"{INTERNAL_API_URL}/api/oauth/clients/{client_id}/")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
        return OAuthClientInformationFull(
            client_id=data["client_id"],
            client_name=data.get("client_name", ""),
            redirect_uris=data["redirect_uris"],
        )

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        async with httpx.AsyncClient() as http:
            r = await http.post(
                f"{INTERNAL_API_URL}/api/oauth/clients/",
                json={
                    "client_id": client_info.client_id,
                    "client_name": client_info.client_name or "",
                    "redirect_uris": [str(u) for u in client_info.redirect_uris],
                },
            )
        if r.status_code >= 400:
            raise RegistrationError(error="server_error", error_description=r.text)

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        state = secrets.token_urlsafe(24)
        self._pending[state] = {"client_id": client.client_id, "params": params}
        return (
            f"{OFFICE_BASE_URL}/oauth/consent"
            f"?client_id={client.client_id}"
            f"&redirect_uri={MCP_PUBLIC_URL}/oauth/django-callback"
            f"&state={state}"
        )

    def pop_pending(self, state: str) -> dict | None:
        return self._pending.pop(state, None)

    def store_mcp_code(self, mcp_code: str, django_code: str, client_id: str, params: AuthorizationParams) -> None:
        self._mcp_codes[mcp_code] = {
            "django_code": django_code,
            "client_id": client_id,
            "params": params,
            "created_at": time.time(),
        }

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        entry = self._mcp_codes.get(authorization_code)
        if entry is None or entry["client_id"] != client.client_id:
            return None
        if time.time() - entry["created_at"] > _CODE_TTL_SECONDS:
            return None
        params: AuthorizationParams = entry["params"]
        return AuthorizationCode(
            code=authorization_code,
            client_id=client.client_id,
            redirect_uri=params.redirect_uri,
            redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
            scopes=["mcp"],
            code_challenge=params.code_challenge,
            expires_at=entry["created_at"] + _CODE_TTL_SECONDS,
            resource=params.resource,
        )

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        entry = self._mcp_codes.pop(authorization_code.code, None)
        if entry is None:
            raise TokenError(error="invalid_grant", error_description="Código inválido ou já usado.")
        async with httpx.AsyncClient() as http:
            r = await http.post(
                f"{INTERNAL_API_URL}/api/oauth/token-exchange/",
                json={"code": entry["django_code"]},
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
        if r.status_code >= 400:
            raise TokenError(error="invalid_grant", error_description=r.text)
        data = r.json()
        return OAuthToken(access_token=data["access_token"], token_type="bearer", scope="mcp")

    async def load_refresh_token(self, client, refresh_token):
        return None

    async def exchange_refresh_token(self, client, refresh_token, scopes):
        raise TokenError(error="unsupported_grant_type", error_description="Sem refresh — o token não expira.")

    async def load_access_token(self, token: str) -> AccessToken | None:
        async with httpx.AsyncClient() as http:
            r = await http.get(f"{INTERNAL_API_URL}/api/auth/me/", headers={"Authorization": f"Bearer {token}"})
        if r.status_code != 200:
            return None
        me = r.json()
        return AccessToken(token=token, client_id="office", scopes=["mcp"], subject=me["id"])

    async def revoke_token(self, token) -> None:
        raw = token.token if hasattr(token, "token") else token
        async with httpx.AsyncClient() as http:
            await http.post(
                f"{INTERNAL_API_URL}/api/oauth/revoke-by-value/",
                json={"access_token": raw},
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
```

Esse código é um ponto de partida real, não pseudocódigo — mas
implementadores devem **verificar contra o `provider.py` real lido no
Step 1** os nomes exatos de campo de `AuthorizationParams`/
`OAuthClientInformationFull` (essa versão pode ter mudado nomes entre
releases do SDK) e ajustar antes de rodar. Se algum nome de campo não
bater, o erro do Python (AttributeError/TypeError) vai apontar exatamente
onde.

- [ ] **Step 3: Rota de callback + wiring no `server.py`**

No `server.py`, depois da criação do `mcp = FastMCP(...)`, adicionar:

```python
import secrets
from starlette.requests import Request
from starlette.responses import RedirectResponse

from oauth_provider import T4EOAuthProvider

_provider = T4EOAuthProvider()

mcp = FastMCP(
    "t4e-office",
    host="0.0.0.0",
    port=8000,
    auth_server_provider=_provider,
    # Preencher AuthSettings/ClientRegistrationOptions/RevocationOptions
    # conforme os campos reais lidos no Step 1 da Task 4 — issuer_url
    # tem que ser MCP_PUBLIC_URL, registro dinâmico habilitado, revoke
    # habilitado.
)


@mcp.custom_route("/oauth/django-callback", methods=["GET"])
async def django_callback(request: Request):
    django_code = request.query_params.get("code")
    state = request.query_params.get("state")
    pending = _provider.pop_pending(state) if state else None
    if not django_code or pending is None:
        return RedirectResponse(url=f"{OFFICE_BASE_URL}/oauth/consent?error=invalid_state", status_code=302)
    mcp_code = secrets.token_urlsafe(32)
    params = pending["params"]
    _provider.store_mcp_code(mcp_code, django_code, pending["client_id"], params)
    redirect = str(params.redirect_uri)
    sep = "&" if "?" in redirect else "?"
    dest = f"{redirect}{sep}code={mcp_code}"
    if params.state:
        dest += f"&state={params.state}"
    return RedirectResponse(url=dest, status_code=302)
```

Verificar no Step 1 se `FastMCP` expõe mesmo `.custom_route` (decorator
Starlette-style) — se o nome real for outro (ex. método pra montar rotas
extra no `Starlette` app subjacente), usar o mecanismo real encontrado.

- [ ] **Step 4: Testar localmente (sem browser real)**

Não é possível automatizar o fluzo completo com browser real neste
ambiente. Verificação mínima: `python -c "import server"` sem erro de
import, e revisão manual linha a linha do fluxo contra o diagrama da
spec — nenhum teste automatizado é exigido nesta task (documentar isso
no relatório).

- [ ] **Step 5: Commit**

```bash
git add mcp-server/oauth_provider.py mcp-server/server.py mcp-server/.env.example
git commit -m "feat(mcp-server): provider OAuth pra suportar Connectors do claude.ai"
```

---

### Task 5: Deploy em produção

**Files (no servidor, via SSH):** `/opt/t4e-office/deploy/.env`,
`/opt/t4e-office/deploy/docker-compose.prod.yml`.

**Interfaces:**
- Consumes: imagens buildadas das Tasks 2 (`web`) e 4 (`mcp`).

- [ ] **Step 1: Gerar e adicionar `OAUTH_INTERNAL_SECRET`**

```bash
ssh root@179.198.122.25
openssl rand -hex 32
cd /opt/t4e-office/deploy
echo "OAUTH_INTERNAL_SECRET=<valor gerado>" >> .env
```

- [ ] **Step 2: Adicionar a variável nos dois serviços do `docker-compose.prod.yml`**

No bloco `web:` → `environment:` adicionar `OAUTH_INTERNAL_SECRET:
${OAUTH_INTERNAL_SECRET}`. No bloco `mcp:` → `environment:` adicionar
`OAUTH_INTERNAL_SECRET: ${OAUTH_INTERNAL_SECRET}` e
`OFFICE_BASE_URL: https://office.t4egroup.com.br` e `MCP_PUBLIC_URL:
https://mcp.t4egroup.com.br`.

- [ ] **Step 3: Pull + rebuild**

```bash
cd /opt/t4e-office && git pull origin main
cd deploy
docker compose -f docker-compose.prod.yml up -d --build web mcp frontend-build frontend
```

- [ ] **Step 4: Smoke test manual do fluxo completo**

No claude.ai (Settings → Connectors → Add custom connector), apontar pra
`https://mcp.t4egroup.com.br/mcp`. Confirmar: abre a tela de
consentimento em `office.t4egroup.com.br/oauth/consent`, login funciona,
clicar Permitir volta pro claude.ai já conectado, e uma ferramenta (ex.
`list_workspaces`) responde de verdade. Este step não tem commit — é
validação operacional.

---

## Self-Review

**Cobertura do spec:** models (Task 1) → endpoints (Task 2) → tela de
consentimento (Task 3) → provider + callback (Task 4) → deploy (Task 5).
Todos os componentes do design da spec têm task correspondente. Escopo
"fora de escopo" da spec (consent granular, revoke automático a partir do
claude.ai, multi-tenant) não tem task — correto, não deveria ter.

**Placeholders:** nenhum "TBD"/"implementar depois". O código de
`oauth_provider.py` no Task 4 é real e completo, com uma nota explícita
de que nomes de campo do SDK precisam ser confirmados contra o código-fonte
lido no Step 1 (não é uma lacuna, é uma dependência declarada — o SDK já
está instalado e legível, não é uma suposição sobre uma lib externa
não verificável).

**Consistência de tipos:** `OAuthClientInfo`/`getOAuthClient` (frontend)
batem campo a campo com a resposta do `GET /api/oauth/clients/<id>/`
(Task 2). `access_token`/`user_id`/`email` do `token-exchange` batem com
o que `exchange_authorization_code` do provider (Task 4) consome
(`data["access_token"]`).
