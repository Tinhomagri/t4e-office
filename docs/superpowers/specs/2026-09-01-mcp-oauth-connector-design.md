# OAuth pro conector MCP do t4e-office — Design

## Contexto e problema

O `mcp-server` (`mcp.t4egroup.com.br`) já funciona pra Claude Code/Desktop
via Bearer token colado manualmente (`claude mcp add ... --header
"Authorization: Bearer <token>"`). Isso não funciona com o recurso
"Connectors" do claude.ai (nível organização): essa tela não aceita header
manual — ela exige que o servidor MCP implemente OAuth 2.0 de verdade
(descoberta via `/.well-known/oauth-authorization-server`, registro
dinâmico de client — RFC 7591 — e um fluxo de login com redirect). Sem
isso, o claude.ai devolve `Couldn't register with T4E Office's sign-in
service`.

## Decisão de arquitetura: proxy OAuth reaproveitando PersonalAccessToken

O pacote `mcp` (FastMCP) já implementa as rotas `/authorize`, `/token`,
`/register`, `/revoke` e o metadata endpoint — o que falta implementar é
só a lógica de negócio, via o protocolo `OAuthAuthorizationServerProvider`
(`mcp.server.auth.provider`, já instalado em
`mcp-server/.venv/lib/python3.12/site-packages/mcp/server/auth/provider.py`).

Em vez de criar um sistema de login paralelo, o `mcp-server` delega a
autenticação pro próprio office — o padrão que a própria doc do
`OAuthAuthorizationServerProvider.authorize()` chama de "proxy pra um
provedor OAuth de terceiros", só que aqui o "terceiro" é o nosso backend
Django, que já tem sessão de usuário.

```
Claude.ai  ──(1) tenta conectar──▶  mcp-server (/authorize)
                                          │
                                          │ (2) redireciona
                                          ▼
                              office.t4egroup.com.br/oauth/consent
                              (login se preciso + tela "Permitir?")
                                          │
                                          │ (3) usuário permite
                                          ▼
                              mcp-server (/oauth/django-callback)
                                          │
                                          │ (4) troca código por token
                                          ▼
                              Django gera/reaproveita um PersonalAccessToken
                              e devolve o valor bruto (uma vez só)
                                          │
                                          ▼
                              mcp-server devolve esse token pro claude.ai
                              como access_token — protocolo padrão dali
                              em diante, IDÊNTICO ao fluxo manual de hoje
```

O token final que o Claude.ai guarda **é literalmente um
`PersonalAccessToken`** (`t4e_pat_...`), o mesmo mecanismo já existente
em Configurações → Tokens de API. Consequências:

- Revogar continua na mesma tela de sempre — sem UI nova de "conectores".
- `_bearer_from`/`_request` no `mcp-server` não mudam nada — o fluxo de
  chamada de ferramenta (`create_card`, `read_document`, etc.) é o mesmo
  de hoje.
- Access token não expira (mesma politica do PAT hoje) — sem necessidade
  de refresh token. `load_refresh_token`/`exchange_refresh_token` do
  provider retornam `None`/levantam erro — não implementados.

## Global Constraints

- Reaproveitar `PersonalAccessToken` como o access_token final — nunca
  criar uma segunda tabela de "tokens de API" com semântica paralela.
- Comunicação `mcp-server` → Django pros passos internos (registrar
  client, trocar código por token) é server-to-server, autenticada por um
  segredo compartilhado via variável de ambiente (`OAUTH_INTERNAL_SECRET`,
  presente em `web` e `mcp` no `docker-compose.prod.yml`) — mesmo padrão
  já usado pro trust interno `mcp`→`web` (`X-Forwarded-Proto`).
- O endpoint de **registro dinâmico de client** (RFC 7591) é
  intencionalmente **aberto** (sem autenticação) — é assim que o padrão
  funciona (qualquer client, incluindo claude.ai, se autorregistra antes
  do usuário logar). A superfície sensível de verdade é o `/authorize`
  (exige login) e o `/token-exchange` interno (exige o segredo
  compartilhado).
- Nenhuma migração de dado — clients/códigos de autorização são novidade,
  não tocam em `PersonalAccessToken` existente além de criar novas linhas.
- Testes cobrem: registro de client, fluxo completo autorize→callback→token
  (com um usuário fake logado), rejeição de código reutilizado/expirado,
  troca de token sem o segredo compartilhado (403).

## Componentes

### 1. Backend Django (`contexts.identity`)

**Models novos** (`infrastructure/django/models.py`):

```python
class OAuthClientModel(models.Model):
    client_id = models.CharField(max_length=64, primary_key=True)
    client_name = models.CharField(max_length=200, blank=True)
    redirect_uris = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)


class OAuthAuthorizationCodeModel(models.Model):
    code = models.CharField(max_length=128, primary_key=True)
    client_id = models.CharField(max_length=64)
    user = models.ForeignKey("identity.UserModel", on_delete=models.CASCADE)
    redirect_uri = models.URLField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
```

(`code_challenge`/PKCE e `state`/`resource` do lado do Claude ficam
inteiramente do lado do `mcp-server` — o código Django é um passo
intermediário só entre "usuário permitiu" e "mcp-server monta o código
final pro Claude", não precisa carregar esses campos.)

**Endpoints novos** (`interface/api/oauth_views.py`, prefixo
`/api/oauth/`):

- `POST /api/oauth/clients/` — corpo `{client_id, client_name,
  redirect_uris}` (client_id gerado pelo `mcp-server` antes de chamar,
  UUID). Sem auth (RFC 7591 é público por design). Idempotente por
  `client_id`.
- `GET /api/oauth/clients/<client_id>/` — devolve `{client_id,
  client_name, redirect_uris}` ou 404. Sem auth (dado não sensível).
- `POST /api/oauth/authorize-code/` — **exige sessão de usuário
  logado** (cookie/JWT normal do office, é chamado pelo FRONTEND depois
  do clique em "Permitir", não server-to-server). Corpo `{client_id,
  redirect_uri}`. Cria uma `OAuthAuthorizationCodeModel` (código
  aleatório ≥128 bits, `expires_at` = agora + 2 minutos) pro usuário
  logado, devolve `{code}`.
- `POST /api/oauth/token-exchange/` — server-to-server, exige header
  `X-Internal-Secret: <OAUTH_INTERNAL_SECRET>` (403 sem ele ou errado).
  Corpo `{code}`. Valida: existe, não expirou, não foi usado, marca
  `used_at`. Gera (via o mesmo `generate_token()` já usado em
  Configurações → Tokens de API) um `PersonalAccessToken` novo pro
  usuário do código, nomeado `"Conector MCP (claude.ai)"`. Devolve
  `{access_token: <raw>, user_id, email}`.
- `POST /api/oauth/revoke-by-value/` — server-to-server, mesmo header
  `X-Internal-Secret`. Corpo `{access_token: <raw>}`. Faz o hash do valor,
  encontra o `PersonalAccessToken` correspondente e marca como revogado
  (mesmo campo `revoked_at` já usado pelo revoke manual). Idempotente —
  token já revogado ou inexistente não é erro, só não faz nada.

**Frontend** (`frontend/src/features/oauth/`, rota nova
`/oauth/consent`):

- Página simples: se não logado, redireciona pro login preservando os
  query params (`client_id`, `redirect_uri`, `state` — passthrough sem
  interpretar); se logado, busca `GET /api/oauth/clients/<client_id>/`
  pra mostrar o nome do client, botões **Permitir**/**Cancelar**.
  Permitir → `POST /api/oauth/authorize-code/` → redireciona o browser
  pra `${redirect_uri}?code=<code>&state=<state original>` (o
  `redirect_uri` aqui é o do **mcp-server** — `/oauth/django-callback` —
  não o do Claude; ver seção mcp-server).

### 2. `mcp-server` (novo módulo `oauth_provider.py`, mais rotas no
`server.py`)

Implementa `OAuthAuthorizationServerProvider[AuthorizationCode,
RefreshToken, AccessToken]` (tipos padrão do SDK, sem subclasse
customizada — não precisamos de campos extras):

- `register_client(client_info)` → `POST` pro Django
  `/api/oauth/clients/` com `client_id`/`client_name`/`redirect_uris` do
  `client_info`. Erros de rede viram `RegistrationError("server_error")`.
- `get_client(client_id)` → `GET` no Django, monta
  `OAuthClientInformationFull` a partir da resposta (ou `None` se 404).
- `authorize(client, params)` → guarda `params` (code_challenge,
  redirect_uri do Claude, state, resource) num dicionário em memória
  chaveado por um `state` interno novo (`secrets.token_urlsafe(32)`), e
  devolve a URL: `https://office.t4egroup.com.br/oauth/consent?client_id=<client.client_id>&redirect_uri=https://mcp.t4egroup.com.br/oauth/django-callback&state=<state interno>`.
- Rota Starlette nova `GET /oauth/django-callback` no app do FastMCP:
  recebe `code` (do Django) e `state` (o interno) — recupera os `params`
  originais guardados no passo anterior, gera um `authorization_code`
  próprio do MCP (`secrets.token_urlsafe(32)`), guarda em memória
  `{mcp_code: {django_code, params}}`, redireciona o browser pro
  `params.redirect_uri` (o do Claude) com `?code=<mcp_code>&state=<params.state>`.
- `load_authorization_code(client, authorization_code)` → lookup no
  dicionário em memória, monta `AuthorizationCode` com os campos batendo
  (`code_challenge`, `redirect_uri`, `scopes=["mcp"]`, `expires_at` = +2min
  da criação).
- `exchange_authorization_code(client, authorization_code)` → pega o
  `django_code` guardado, `POST` pro Django `/api/oauth/token-exchange/`
  com o header do segredo interno, recebe `access_token` bruto, devolve
  `OAuthToken(access_token=<raw>, token_type="bearer", scope="mcp")` (sem
  `expires_in`, sem `refresh_token`).
- `load_access_token(token)` → `GET` no Django `/api/auth/me/` com esse
  Bearer (endpoint que já existe, já valida `PersonalAccessToken` via
  `PersonalTokenAuthentication`) — 200 vira `AccessToken(token=token,
  client_id="office", scopes=["mcp"], subject=<id do /me/>)`; qualquer
  outro status vira `None` (token inválido/revogado).
- `revoke_token(token)` → `POST` no Django `/api/oauth/revoke-by-value/`
  (server-to-server, mesmo segredo interno), corpo `{access_token: <raw>}`.
  O `AccessToken` do provider só carrega o valor bruto do token, não o id
  do registro — reaproveitar o `DELETE .../tokens/<id>/` que já existe pra
  Configurações → Tokens de API exigiria o id, que não temos aqui. Esse
  endpoint novo faz o hash do valor recebido (mesmo `generate_token()`/
  hash já usado) e marca o `PersonalAccessToken` correspondente como
  revogado — sem precisar do id.
- `load_refresh_token`/`exchange_refresh_token` → não implementados
  (retornam `None`) — PAT não expira, sem necessidade de refresh.

Estado em memória (`authorize`/callback) é aceitável: o processo do
`mcp-server` é de vida longa (container único, `restart: unless-stopped`),
e o intervalo entre `/authorize` e o callback do Django é de segundos —
perder esse estado só num restart do container durante uma autorização
em andamento é aceitável (usuário tenta de novo).

`FastMCP(..., auth_server_provider=T4EOAuthProvider(), auth=AuthSettings(
issuer_url="https://mcp.t4egroup.com.br",
client_registration_options=ClientRegistrationOptions(enabled=True),
revocation_options=RevocationOptions(enabled=True)))`.

### 3. Deploy

- `OAUTH_INTERNAL_SECRET` novo no `.env` de produção (gerado uma vez,
  `openssl rand -hex 32` ou similar), presente nos `environment:` de
  `web` e `mcp` no `docker-compose.prod.yml`.
- Sem serviço novo, sem porta nova — mesmo `mcp` container.

## Testes

- Backend: registro de client (idempotente), `authorize-code` exige
  login, `token-exchange` rejeita sem/com segredo errado, rejeita código
  expirado/já usado/inexistente, gera PAT válido no sucesso.
- `mcp-server`: smoke test manual documentado no README (fluxo real
  exige um browser — não dá pra automatizar num teste unitário simples;
  documentar o passo a passo de verificação manual em produção como parte
  da task final, igual foi feito pro deploy do MCP original).

## Fora de escopo

- Consent granular por escopo (hoje só existe um escopo, `"mcp"` — tudo
  que o token já pode fazer no office).
- Revogar pelo lado do claude.ai automaticamente refletir no office (o
  `revoke_token` cobre o caminho "office revoga → claude.ai perde
  acesso", não o inverso — claude.ai não expõe hoje um botão que chame
  nosso `/revoke`, mas a rota existe caso ele chame).
- Multi-tenant (mais de um workspace por token) — mesma limitação que já
  existe hoje no PAT.
