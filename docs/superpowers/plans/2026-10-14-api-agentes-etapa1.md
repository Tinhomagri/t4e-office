# API de agentes — Etapa 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API REST só leitura para os agentes do Leonardo: tokens de agente, bloqueio de escrita, auditoria, limite de taxa, `/projetos`, `/cards`, `/horas`, mais os campos novos no Office que essas rotas precisam.

**Architecture:** Contexto Django novo `contexts/agent_api`. Um middleware global resolve o token de agente e cuida de 401/403/429/auditoria; as views (DRF, sem auth própria) só leem ORM e serializam no formato do Leonardo, com paginação por cursor em `(updated_at, id)`.

**Tech Stack:** Django 5 + DRF + drf-spectacular, pytest-django (SQLite em memória), React/TS + vitest no front.

**Spec:** `docs/superpowers/specs/2026-10-14-api-agentes-design.md`

## Global Constraints

- Prefixo: `/api/agentes/v1/`. Sem auth: `health/`, `openapi.json`.
- Token: header `Authorization: Bearer <token>`, comparado por `sha256(token).hexdigest()`. Escopo exigido: `office:ler`.
- Qualquer método ≠ GET/HEAD/OPTIONS com token de agente, em QUALQUER rota → `403 {"erro":"somente_leitura","mensagem":...}`.
- Erro sempre `{"erro": "<codigo>", "mensagem": "<texto>"}`.
- Lista: `{"dados": [...], "meta": {"proximo_cursor": str|null, "total": int}}`; `limit` padrão 50, máx 200; `cursor`; `updated_since` (ISO 8601).
- Datas: ISO 8601 em `America/Sao_Paulo` (`timezone.localtime(dt).isoformat()`); só data → `YYYY-MM-DD`. Horas: decimal com 2 casas.
- Limite: 60 req/min por agente → `429` + header `Retry-After`.
- Nunca expor e-mail, telefone, endereço, custo.
- Comandos de teste: `cd backend && pytest -q <path>`; front: `cd frontend && npx vitest run <path>` e `npm run lint`.
- Código e comentários em português, no estilo do repo.

## File Structure

```
backend/src/contexts/agent_api/
  __init__.py, apps.py, models.py            # registro Django (models reais em infrastructure)
  infrastructure/models.py                   # AgentTokenModel, AgentAuditLogModel, TrackedTimeEntryModel
  application/tokens.py                      # hash_token, resolve_agent, import_agents
  application/tracked_time.py                # rebuild_tracked_entries(card_id)
  interface/middleware.py                    # AgentTokenMiddleware
  interface/pagination.py                    # paginate(), parse_updated_since()
  interface/formatting.py                    # dt(), day(), hours(), mapeamentos de enum
  interface/views.py                         # health, auditoria, projetos, cards, horas
  interface/urls.py
  management/commands/importar_tokens_agentes.py
  management/commands/recalcular_tempo_rastreado.py
  migrations/0001_initial.py
  tests/test_auth.py, test_tokens.py, test_tracked_time.py, test_projetos.py, test_cards.py, test_horas.py
backend/src/contexts/projects/  (campos novos — ver Tasks 3-4)
backend/src/contexts/projects/domain/working_time.py  (+ segmentos com responsável)
frontend/src/features/boards/...  (configurações do projeto, drawer, Kanban)
```

---

### Task 1: Modelos de agente + importação de tokens

**Files:**
- Create: `contexts/agent_api/{__init__,apps,models}.py`, `infrastructure/models.py`, `application/tokens.py`, `management/commands/importar_tokens_agentes.py`, migration, `tests/test_tokens.py`
- Modify: `config/settings/base.py` (INSTALLED_APPS += `"contexts.agent_api"`)

**Interfaces — Produces:**
- `hash_token(token: str) -> str`
- `resolve_agent(token: str) -> AgentTokenModel | None` (só ativo)
- `import_agents(data: dict, workspace: WorkspaceModel) -> tuple[int, int]` (criados/atualizados; ausentes → `ativo=False`)

- [ ] **Step 1: Teste**

```python
# tests/test_tokens.py
import hashlib, pytest
from contexts.agent_api.application.tokens import hash_token, import_agents, resolve_agent
from contexts.agent_api.infrastructure.models import AgentTokenModel
from contexts.identity.infrastructure.django.models import UserModel, WorkspaceModel

@pytest.fixture
def ws(db):
    owner = UserModel.objects.create_user(email="o@t4e.com", password="x", full_name="O", is_active=True)
    return WorkspaceModel.objects.create(name="T4E", slug="t4e", owner=owner)

def test_importa_resolve_e_desativa_ausente(ws):
    h = hashlib.sha256(b"segredo").hexdigest()
    import_agents({"agents": [{"id": "saude", "token_hash": h, "ativo": True, "escopos": ["office:ler"]},
                              {"id": "velho", "token_hash": "0" * 64, "ativo": True, "escopos": []}]}, ws)
    assert resolve_agent("segredo").id == "saude"
    assert hash_token("segredo") == h
    import_agents({"agents": [{"id": "saude", "token_hash": h, "ativo": True, "escopos": ["office:ler"]}]}, ws)
    assert AgentTokenModel.objects.get(id="velho").ativo is False
    assert resolve_agent("errado") is None
```

- [ ] **Step 2:** `pytest -q src/contexts/agent_api/tests/test_tokens.py` → FAIL (módulo ausente).
- [ ] **Step 3: Implementar**

```python
# infrastructure/models.py
class AgentTokenModel(models.Model):
    id = models.SlugField(primary_key=True, max_length=60)
    token_hash = models.CharField(max_length=64, unique=True)
    ativo = models.BooleanField(default=True)
    escopos = models.JSONField(default=list)
    workspaces = models.ManyToManyField("identity.WorkspaceModel", related_name="agent_tokens")
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)
    class Meta: db_table = "agent_api_token"

class AgentAuditLogModel(models.Model):
    agente = models.ForeignKey(AgentTokenModel, null=True, on_delete=models.SET_NULL, related_name="auditoria")
    metodo = models.CharField(max_length=10)
    rota = models.CharField(max_length=500)
    status = models.PositiveSmallIntegerField()
    correlation_id = models.CharField(max_length=120, blank=True, default="")
    criado_em = models.DateTimeField(auto_now_add=True, db_index=True)
    class Meta: db_table = "agent_api_audit"; ordering = ["-criado_em"]
```
`tokens.py`: `hash_token` = sha256 hex; `resolve_agent` filtra `token_hash=..., ativo=True`; `import_agents` faz `update_or_create` por id, `workspaces.add(ws)`, depois `exclude(id__in=ids).update(ativo=False)`. Comando: `importar_tokens_agentes <arquivo> --workspace <slug>` lê JSON e imprime contagem. `models.py` raiz reexporta (padrão do `chatwoot/models.py`). `makemigrations agent_api`.
- [ ] **Step 4:** teste passa.
- [ ] **Step 5:** commit `feat(agent_api): tokens de agente com hash e importação`.

### Task 2: Middleware (401/403/429/auditoria) + health + auditoria

**Files:**
- Create: `interface/middleware.py`, `interface/urls.py`, `interface/views.py` (health, auditoria), `interface/pagination.py`, `interface/formatting.py`, `tests/test_auth.py`
- Modify: `config/settings/base.py` (MIDDLEWARE após `AuthenticationMiddleware`; `CACHES` Redis via `env("CACHE_URL", default="")` → `django.core.cache.backends.redis.RedisCache`, senão locmem), `config/urls.py` (`path("api/agentes/v1/", include(...))`)

**Interfaces — Produces:**
- `request.agent: AgentTokenModel` em views do prefixo
- `paginate(request, qs, serialize: Callable) -> Response` (envelope + cursor em `(updated_at, id)`; aceita `order_field="updated_at"`)
- `parse_updated_since(request) -> datetime | None` (inválido → `ValidationError` → 400 `{"erro":"parametro_invalido"}`)
- `dt(x) -> str|None`, `day(x) -> str|None`, `hours(seconds) -> float`
- `agent_workspace_ids(request) -> list` (ids dos workspaces do token)

- [ ] **Step 1: Testes** (`tests/test_auth.py`), um por regra:
  - `GET /api/agentes/v1/health/` sem token → 200 `{"status":"ok"}`
  - `GET /api/agentes/v1/auditoria/` sem token → 401 `erro=nao_autenticado`; token inválido → 401
  - token sem `office:ler` → 403 `erro=escopo_insuficiente`
  - `POST/PUT/PATCH/DELETE /api/agentes/v1/projetos/` e `POST /api/cards/<uuid>/` com token → 403 `erro=somente_leitura`; cada um gera linha `AgentAuditLogModel` com `status=403` e `correlation_id` do header `HTTP_X_CORRELATION_ID`
  - `GET /api/projects/` com token de agente → 401 (não vale fora do prefixo)
  - 61ª requisição no minuto → 429 com `Retry-After` (limpar cache no fixture: `cache.clear()`)
  - `GET /api/agentes/v1/../.env` e `/api/agentes/v1/nada/` → 404 JSON `erro=nao_encontrado`
  - `/auditoria?agente=saude&desde=<iso>` → envelope com `agente, metodo, rota, status, correlation_id, quando`
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3: Implementar middleware**

```python
PREFIX = "/api/agentes/v1/"
PUBLIC = {PREFIX + "health/", PREFIX + "openapi.json"}
SAFE = {"GET", "HEAD", "OPTIONS"}
LIMIT_PER_MIN = 60

def _erro(status, codigo, mensagem, **headers):
    resp = JsonResponse({"erro": codigo, "mensagem": mensagem}, status=status)
    for k, v in headers.items(): resp[k] = v
    return resp

class AgentTokenMiddleware:
    def __init__(self, get_response): self.get_response = get_response

    def __call__(self, request):
        in_api = request.path.startswith(PREFIX)
        if in_api and request.path in PUBLIC:
            return self.get_response(request)
        token = _bearer(request)             # None se não for "Bearer x"
        agent = resolve_agent(token) if token else None
        if not in_api and agent is None:
            return self.get_response(request)  # fluxo normal do Office
        resp = self._handle(request, agent, token, in_api)
        AgentAuditLogModel.objects.create(
            agente=agent, metodo=request.method, rota=request.get_full_path()[:500],
            status=resp.status_code, correlation_id=request.headers.get("X-Correlation-Id", "")[:120])
        return resp

    def _handle(self, request, agent, token, in_api):
        if agent is None:
            return _erro(401, "nao_autenticado", "Token ausente, inválido ou desativado.")
        if request.method not in SAFE:
            return _erro(403, "somente_leitura", "Agentes só têm acesso de leitura.")
        if not in_api:
            return _erro(401, "nao_autenticado", "Token de agente só vale em /api/agentes/v1/.")
        if "office:ler" not in agent.escopos:
            return _erro(403, "escopo_insuficiente", "Token sem o escopo office:ler.")
        retry = _rate_limited(agent.id)      # cache.incr em chave f"agent-rl:{id}:{minuto}", ttl 60
        if retry:
            return _erro(429, "limite_excedido", "Limite de 60 requisições por minuto.", **{"Retry-After": str(retry)})
        request.agent = agent
        resp = self.get_response(request)
        if resp.status_code == 404 and not resp.get("Content-Type", "").startswith("application/json"):
            return _erro(404, "nao_encontrado", "Rota não encontrada.")
        return resp
```
Views do contexto: `authentication_classes = []`, `permission_classes = [AllowAny]` (middleware já barrou). Exception handler local: subclasse `AgentAPIView(APIView)` com `handle_exception` que converte `ValidationError`/`NotFound` em `{"erro","mensagem"}`. Cursor: base64 urlsafe de `f"{updated_at.isoformat()}|{id}"`; filtro `Q(updated_at__gt=t) | Q(updated_at=t, id__gt=id)`; `total` = `qs.count()` antes do cursor; busca `limit+1` para decidir `proximo_cursor`. `health` e `auditoria` (filtros `agente`, `desde`; lista linhas de todos os agentes que compartilham workspace com o token).
- [ ] **Step 4:** testes passam + `pytest -q src/contexts/projects src/contexts/identity` (middleware não quebra fluxo normal).
- [ ] **Step 5:** commit `feat(agent_api): middleware somente leitura, auditoria e limite de taxa`.

### Task 3: Campos novos de Projeto/Sprint/Worklog + UI de configurações

**Files:**
- Modify: `projects/infrastructure/django/models.py` (ProjectModel: `status` choices `active/paused/closed` default `active`, `manager_client_id`, `manager_contract_id` CharField(64, blank), `updated_at` auto_now; SprintModel e WorklogModel: `updated_at` auto_now), migration `projects`, `projects/interface/api/board_config_views.py` (ProjectDetailView aceita/devolve os 3 campos), testes em `projects/interface/api/tests/test_project_agent_fields.py`
- Modify front: tipos em `workspace.types.ts`, tela de configurações do projeto (`frontend/src/features/boards/settings/` — achar o form de detalhes com `grep -rn "deadline" frontend/src/features/boards/settings`): select Status + 2 inputs "ID do cliente no Manager" / "ID do contrato no Manager".

- [ ] **Step 1:** teste PATCH `/api/projects/<id>/` com `{"status":"paused","manager_contract_id":"C-9"}` → 200 e GET devolve; `status` inválido → 400.
- [ ] **Step 2:** FAIL. **Step 3:** implementar (migration com `default=timezone.now` para `updated_at` existentes). **Step 4:** PASS + vitest/lint front.
- [ ] **Step 5:** commit `feat(projects): status do projeto e ids do Manager`.

### Task 4: Campos novos de Card (tipos, bloqueio, pedido do cliente) + UI

**Files:**
- Modify: `projects/infrastructure/django/models.py` (TYPE_CHOICES += `("support","Suporte"), ("improvement","Melhoria")`; `blocked` Bool, `block_reason` Text blank, `blocked_at` DateTime null, `client_request` Bool null), `projects/domain/entities/card.py` (CardType + campos), `repositories_impl.py` (mapear), `application/use_cases/update_card.py` (params `blocked`, `block_reason`, `client_request`; `_TRACKED` += `blocked`, `block_reason`; `blocked_at` = now ao bloquear, None ao desbloquear; desbloquear limpa motivo; bloquear sem motivo → `ValidationError`), `interface/api/serializers.py` (Card + UpdateCard), `card_views.py` (`card_row`, `_card_dict`), migration; testes `projects/interface/api/tests/test_card_block.py`
- Modify front: `workspace.types.ts`, `CardDrawer.tsx` (ToolbarButton cadeado: bloquear abre prompt de motivo; toggle "Pedido do cliente" no painel lateral; `FIELD_LABEL` += `blocked: "Bloqueio"`, `block_reason: "Motivo do bloqueio"`), `KanbanView.tsx` (`CardCell`: selo vermelho `Lock` com `title={card.block_reason}` quando `card.blocked`), select de tipo (onde houver lista de tipos: `grep -rn '"chore"' frontend/src`).

- [ ] **Step 1:** testes: PATCH `{"blocked":true,"block_reason":"Aguardando acesso"}` → 200, histórico `blocked`; `{"blocked":true}` sem motivo → 400; `{"blocked":false}` limpa motivo/data; PATCH `{"type":"support"}` → 200; `{"client_request":true}` → 200.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS (+ suíte `projects`), vitest + lint.
- [ ] **Step 5:** commit `feat(boards): card bloqueado com motivo, tipos suporte/melhoria e pedido do cliente`.

### Task 5: Tempo rastreado materializado

**Files:**
- Modify: `projects/domain/working_time.py` — `compute_working_time` passa a devolver também `segments: list[Segment]` (`Segment(start, end, seconds, assignee_id)`; trechos FECHADOS); eventos `assignee_id` atualizam responsável corrente (inicial = `old_value` do 1º evento de assignee, senão `current_assignee_id` novo kwarg opcional). Testes novos em `projects/tests/test_working_time.py`.
- Modify: `projects/infrastructure/working_time_query.py` (`TRACKED_FIELDS` += `"assignee_id"`; passar `current_assignee_id`).
- Modify: `projects/interface/api/pause_views.py` (após gravar histórico: `CardModel.objects.filter(id=card.id).update(updated_at=timezone.now())`).
- Create: `agent_api/infrastructure/models.py` += `TrackedTimeEntryModel(id uuid, card FK, pessoa FK null, inicio, fim, segundos, updated_at auto_now; unique (card, inicio))`; `application/tracked_time.py::rebuild_tracked_entries(card_id)` (apaga as do card que não batem, upsert por `(card, inicio)` — mantém id estável); signal `post_save` em `CardHistoryModel` quando `field in {"status","paused","assignee_id"}` (registrar em `apps.py.ready`); comando `recalcular_tempo_rastreado`.
- Test: `agent_api/tests/test_tracked_time.py`.

- [ ] **Step 1:** testes: domínio — pausa fecha segmento com responsável; troca de responsável no meio NÃO quebra trecho? → **quebra** (cada pessoa ganha o seu trecho). Integração — criar histórico doing→pausa gera 1 `TrackedTimeEntryModel` com `pessoa=assignee`; recriar com mesmos eventos mantém o mesmo `id`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + `pytest -q src/contexts/projects src/contexts/presence`.
- [ ] **Step 5:** commit `feat(agent_api): materializa trechos de tempo rastreado por pessoa`.

### Task 6: `GET /projetos`

**Files:** `interface/views.py` (+ `ProjetosView`), `urls.py`, `formatting.py` (`PROJECT_STATUS = {"active":"ativo","paused":"pausado","closed":"encerrado"}`), `tests/test_projetos.py`

- [ ] **Step 1:** testes: só projetos dos workspaces do token; arquivado → `encerrado`; filtros `status`, `squad` (nome ou id), `updated_since`; paginação `limit=1` gera `proximo_cursor` e a 2ª página traz o outro; campos exatos `{id,nome,squad,status,cliente_id,contrato_id,inicio,fim_previsto,atualizado_em}`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar (`inicio` = `min(sprint.start_date)` ou `created_at.date()`; `fim_previsto` = `deadline`). **Step 4:** PASS. **Step 5:** commit `feat(agent_api): GET /projetos`.

### Task 7: `GET /cards` e `/cards/{id}`

**Files:** `views.py` (+ `CardsView`, `CardDetailView`), `formatting.py` (mapas abaixo), `tests/test_cards.py`

```python
CARD_TYPE = {"feature":"feature","spike":"feature","bug":"bug","support":"suporte",
             "improvement":"melhoria","debt":"melhoria","chore":"melhoria"}   # resto excluído
PRIORITY = {"low":"baixa","medium":"media","high":"alta","urgent":"critica"}
CATEGORY = {"todo":"a_fazer","in_progress":"em_andamento","done":"concluido"}
CLIENT_SOURCES = {"public_link","conversations"}
def origem(card): 
    if card.client_request is not None: return "pedido_cliente" if card.client_request else "interno"
    return "pedido_cliente" if card.source in CLIENT_SOURCES else "interno"
```
- `horas_gastas` = soma `TrackedTimeEntryModel.segundos` do card + trecho aberto (`working_time_for_cards`, `business_seconds_between(running_since, now)`); `horas_apontadas` = soma `WorklogModel.time_seconds` (anotar com `Subquery`/`Sum`, sem N+1); `horas_estimadas` = `original_estimate_seconds/3600` ou null.
- Filtros: `projeto`, `status` (slug), `tipo` (valor da API → conjunto de tipos Office), `bloqueado=true|false`, `responsavel`, `concluido_desde` (`resolved_at__gte`), `updated_since`. Exclui `archived_at` não nulo? → **não** (agente quer histórico; expõe `arquivado: bool`).

- [ ] **Step 1:** testes: mapeamentos (debt→melhoria, urgent→critica, épico ausente), `origem` derivada e override, `bloqueado` filtro, `horas_gastas` com 1 trecho de 2h = `2.0`, `horas_apontadas` com worklog 5400s = `1.5`, card de outro workspace → 404 no detalhe, campos exatos da spec §3 + `status_categoria`, `horas_apontadas`, `arquivado`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS. **Step 5:** commit `feat(agent_api): GET /cards`.

### Task 8: `GET /horas` + OpenAPI + aceite

**Files:** `views.py` (+ `HorasView`, `OpenAPIView`), `tests/test_horas.py`, `tests/test_aceite.py`

- `/horas`: duas querysets (TrackedTimeEntry, Worklog) filtradas por workspace, `projeto`, `pessoa`, `de`/`ate` (por data local), `updated_since`; serializar `{id: "r_<uuid>"|"m_<uuid>", pessoa_id, card_id, projeto_id, data, horas, descricao, fonte}`; juntar em Python ordenado por `(updated_at, id)` e paginar com o mesmo cursor (`paginate` aceita lista já ordenada — adicionar `paginate_list(request, rows)` em `pagination.py` que aplica o cursor em memória; volume é pequeno).
- `openapi.json`: `SpectacularAPIView.as_view(urlconf="contexts.agent_api.interface.urls", authentication_classes=[], permission_classes=[AllowAny])`, com `@extend_schema` documentando os slugs de status variáveis por quadro e `status_categoria`.
- `test_aceite.py`: replica o §7 do Leonardo ponta a ponta (health, 401s, envelope em projetos/cards/horas, 403 nos 4 métodos + auditoria, paginação/updated_since, nenhuma chave `email|phone|telefone|salario|custo` em nenhuma resposta, `/../.env` → 404).

- [ ] **Step 1:** testes. **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `pytest -q src/contexts/agent_api` PASS + suíte completa (só falhas pré-existentes de `chatwoot/tests/test_api.py`). **Step 5:** commit `feat(agent_api): GET /horas, openapi.json e teste de aceite`.

---

## Fora desta etapa
`/cards/{id}/historico`, `/sprints`, `/pessoas` (etapa 2); webhooks (etapa 3); deploy na VPS (rodar `migrate`, configurar `CACHE_URL`, importar hashes) — instruções no fim da etapa 1 para o usuário.
