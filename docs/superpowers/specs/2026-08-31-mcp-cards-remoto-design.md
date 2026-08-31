# MCP remoto para criação de cards via Claude

Data: 2026-08-31

## Contexto

Já existe endpoint HTTP `POST /api/projects/<project_id>/cards/` no backend
(`backend/src/contexts/projects/interface/api/card_views.py`), autenticado via
JWT, com capability `CREATE_ISSUE`. Um protótipo local de servidor MCP
(`mcp-server/server.py`, stdio, FastMCP) já foi validado ponta a ponta: login
por email/senha, `list_workspaces`, `list_projects`, `create_card` — criou
cards reais nos projetos `TT` e `ADASD` em ambiente de desenvolvimento local.

Esse protótipo exige, por pessoa: clonar o repo, criar venv, configurar
`.env` com email/senha, e apontar pra `localhost`. Não escala pra equipe.

## Objetivo

Qualquer pessoa da equipe consegue, sem clonar repo nem configurar nada
localmente: gerar um token pessoal no próprio office (já logada via Google),
colar esse token na configuração de servidor MCP remoto do Claude dela, e a
partir daí pedir por chat/terminal para criar ou listar cards — a chamada
chega de verdade no backend de produção.

## Não-objetivos

- Popup "Continuar com Google" dentro do Claude (exigiria implementar
  servidor OAuth 2.1 completo — fora de escopo agora).
- Sistema de escopos granulares por token (token vale como a permissão
  normal do usuário no sistema).
- Expiração automática de token (só revogação manual).
- Novas ferramentas além de `list_workspaces`, `list_projects`,
  `create_card` (evolução futura, fora deste spec).

## Arquitetura

```
Claude (de cada pessoa)
   │  HTTP + Authorization: Bearer <token pessoal>
   ▼
mcp.t4egroup.com.br  (container novo: mcp-server, transporte HTTP)
   │  repassa Authorization: Bearer <mesmo token>
   ▼
office.t4egroup.com.br  (backend Django existente)
   │  PersonalTokenAuthentication → identifica user → capabilities normais
   ▼
Postgres (mesmo banco de produção)
```

O container `mcp-server` é um proxy fino sem lógica de permissão própria:
recebe a chamada MCP, repassa o Bearer token do usuário para a API Django, e
devolve a resposta. Toda autorização acontece no backend, reaproveitando o
sistema de capabilities já existente.

## Componentes

### 1. Backend — `PersonalAccessToken`

Novo model em `contexts/identity` (mesmo bounded context do `UserModel`):

```python
class PersonalAccessToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4)
    user = models.ForeignKey(UserModel, on_delete=models.CASCADE, related_name="personal_tokens")
    name = models.CharField(max_length=100, blank=True)
    token_hash = models.CharField(max_length=64, unique=True)  # sha256 hex
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
```

- Geração: `secrets.token_urlsafe(32)`, prefixo legível (ex. `t4e_pat_...`)
  pra reconhecimento visual; só o hash SHA-256 é persistido.
- Token em texto puro é retornado **uma única vez**, na resposta do POST de
  criação. Nunca mais recuperável.

### 2. Backend — `PersonalTokenAuthentication`

Nova `authentication_class` do DRF (`rest_framework.authentication.BaseAuthentication`):
- Lê header `Authorization: Bearer <token>`
- Se não for JWT (heurística: prefixo `t4e_pat_` ou falha ao decodificar como
  JWT), calcula SHA-256 e busca `PersonalAccessToken` com `revoked_at IS NULL`
- Autentica como o `user` do token; atualiza `last_used_at` (fire-and-forget,
  não bloqueia a resposta)
- Registrada em `DEFAULT_AUTHENTICATION_CLASSES` junto com a JWT existente —
  DRF tenta cada uma em ordem, não há conflito

### 3. Backend — endpoints de gestão de token

Em `contexts/identity/interface/api/`:
- `POST /api/auth/tokens/` — body opcional `{"name": "..."}`, retorna
  `{"id", "name", "token", "created_at"}` (token em texto puro, só aqui)
- `GET /api/auth/tokens/` — lista os tokens do usuário autenticado, **sem**
  o valor do token (`id`, `name`, `created_at`, `last_used_at`)
- `DELETE /api/auth/tokens/<id>/` — seta `revoked_at`, 204. Só o dono do
  token pode revogar (filtra por `user=request.user`)

### 4. Frontend — tela "Tokens de API"

Nova seção em Configurações (mesmo padrão visual das telas existentes):
- Botão "Gerar novo token" → modal com campo nome opcional → mostra token
  uma vez com aviso de que não será exibido de novo
- Lista de tokens ativos (nome, criado em, último uso) com ação "Revogar"

### 5. Servidor MCP remoto

Evolução de `mcp-server/server.py`:
- Transporte HTTP (`mcp.server.fastmcp` com `streamable-http`) em vez de
  stdio
- Sem credenciais embutidas — cada requisição chega com o Bearer token do
  usuário (configurado na conexão do Claude), o servidor só repassa esse
  header pra API Django em toda chamada (`_request` deixa de fazer
  login/refresh próprio)
- Container Docker (mesma imagem base Python do backend, copia só
  `mcp-server/`), novo serviço `mcp` em `backend/docker-compose.yml` (prod),
  exposto via reverse proxy em `mcp.t4egroup.com.br` com HTTPS

### 6. Infra

- Subdomínio novo `mcp.t4egroup.com.br` apontando pro mesmo servidor de
  `office.t4egroup.com.br`
- Certificado HTTPS (Let's Encrypt, mesmo mecanismo já usado pro domínio
  principal — confirmar setup exato durante implementação)
- `docker-compose.yml` de prod ganha serviço `mcp`, sem porta pública
  direta — reverse proxy (Nginx ou equivalente já existente) roteia
  `mcp.t4egroup.com.br` pra ele

## Fluxo de uso (pessoa nova)

1. Loga no office normalmente (Google)
2. Vai em Configurações → Tokens de API → "Gerar novo token" → copia o valor
3. No Claude, adiciona servidor MCP remoto: URL `https://mcp.t4egroup.com.br`
   + cola o token como credencial
4. Pede "cria card X no projeto Y" — funciona direto, sem instalar nada

## Erros e casos de borda

- Token revogado/inválido → backend responde 401 → MCP server propaga erro
  claro pro Claude (não derruba a sessão)
- Backend fora do ar → MCP server retorna erro de upstream
- Token vazado → pessoa revoga na própria tela de Configurações, sem
  depender de ninguém do time técnico
- Múltiplos tokens por pessoa são permitidos (ex. um por dispositivo), sem
  limite implementado nesta versão

## Testes

- Unit: hash/verificação de token, `PersonalTokenAuthentication`, endpoints
  de criar/listar/revogar (incluindo tentativa de revogar token de outro
  usuário → deve falhar)
- Integração: container MCP local contra backend local, repetindo o fluxo já
  validado manualmente (login → list_workspaces → list_projects →
  create_card), agora com token pessoal em vez de JWT de login
- Manual: gerar token real em prod, testar criação de card de ponta a ponta
  antes de anunciar pra equipe

## Fora de escopo / próximos passos possíveis

- OAuth "Continuar com Google" nativo no Claude (se a fricção do token
  colado se mostrar um problema real)
- Mais ferramentas MCP (editar card, comentar, mover status, etc.)
- Escopo granular por token (hoje vale como o usuário inteiro)
