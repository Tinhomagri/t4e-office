# API de leitura para agentes (Leonardo) — design

Origem: `instrucoes-programador-office.md` (Leonardo, 14/10/2026). Entrega em produção (`office.t4egroup.com.br`), sem homologação separada: API só lê, token de agente não escreve.

## Arquitetura

Contexto novo `backend/src/contexts/agent_api/`, montado em `/api/agentes/v1/`. Views DRF lendo ORM direto, serializers no formato do Leonardo (nomes em português, datas ISO em `America/Sao_Paulo`, horas decimais).

## 1. Autenticação, somente leitura, auditoria

- `AgentTokenModel`: `id` (slug), `token_hash` (SHA-256 hex), `ativo`, `escopos` (JSON), `workspaces` (M2M), `criado_em`, `atualizado_em`.
- `manage.py importar_tokens_agentes <arquivo.json> --workspace <slug>`: upsert pelo `id`; agente ausente do arquivo vira `ativo=False`.
- Middleware global (`AgentTokenMiddleware`), ativo quando o Bearer bate com hash de agente:
  - método ≠ GET em qualquer rota (inclusive `/api/...` normais e inexistentes) → `403 {"erro":"somente_leitura"}`;
  - fora de `/api/agentes/v1/` com GET → `401` (token de agente não vale nas rotas normais).
- Dentro de `/api/agentes/v1/`: sem token / inválido / inativo → `401`; sem escopo `office:ler` → `403`.
- `AgentAuditLogModel`: agente (ou null se token inválido), método, rota, status, `correlation_id` (header `X-Correlation-Id`), `criado_em`. Grava toda requisição de agente, incluindo 401/403/429.
- Rate limit: 60/min por agente (DRF throttle), cache Django passa para Redis (`REDIS_URL`). Acima → `429` + `Retry-After`.
- Sem auth: `GET /health` → `{"status":"ok"}`, `GET /openapi.json` (drf-spectacular, só rotas de agente).
- `GET /auditoria?agente=&desde=`: exige token de agente.
- Erros: `{ "erro": "<codigo>", "mensagem": "<texto>" }` via exception handler do contexto. Rota inexistente → 404 (inclui `/../.env`).

## 2. Campos novos no Office

| Campo | Modelo | UI |
|---|---|---|
| `status` (`active`/`paused`/`closed`) | Project | select nas configurações; arquivado → `encerrado` |
| `manager_client_id`, `manager_contract_id` (texto) | Project | 2 inputs nas configurações (depois: select vindo da API do Manager) |
| `updated_at` (auto_now) | Project, Sprint, Worklog | — |
| tipos `support` (Suporte), `improvement` (Melhoria) | Card | select de tipo |
| `blocked`, `block_reason`, `blocked_at` | Card | botão Bloquear no drawer (pede motivo), selo 🔒 no Kanban, histórico |
| `client_request` (null=automático/true/false) | Card | toggle "Pedido do cliente" no drawer |
| `TrackedTimeEntryModel` (card, pessoa, início, fim, segundos, updated_at) | novo | — |

- Trechos rastreados: signal no `CardHistoryModel` (campos `status`, `paused`, `assignee_id`) recalcula os trechos fechados do card a partir do histórico (`domain.working_time`, estendido para devolver trechos + responsável do momento) e faz upsert. Comando `recalcular_tempo_rastreado` para backfill.
- Pausar/retomar passa a tocar `card.updated_at`.

## 3. Rotas

Lista: `{ "dados": [...], "meta": { "proximo_cursor": "...", "total": N } }`, `limit` (padrão 50, máx 200), `cursor` opaco sobre `(atualizado_em, id)`, `updated_since` em toda lista. Tudo filtrado aos workspaces do token.

- `GET /projetos` (`status`, `squad`, `updated_since`): `id, nome, squad, status, cliente_id, contrato_id, inicio, fim_previsto, atualizado_em`. `inicio` = início da 1ª sprint ou criação; `fim_previsto` = `deadline`.
- `GET /cards`, `/cards/{id}` (`projeto, status, tipo, bloqueado, responsavel, concluido_desde, updated_since`). Exclui épicos e tipos de marketing. Mapeamentos:
  - tipo: feature/spike→`feature`, bug→`bug`, support→`suporte`, improvement/debt/chore→`melhoria`;
  - prioridade: low/medium/high/urgent → `baixa/media/alta/critica`;
  - `status` = slug da coluna + `status_categoria` (`a_fazer/em_andamento/concluido`);
  - `origem`: `client_request` explícito, senão `source ∈ {public_link, conversations}` → `pedido_cliente`, resto `interno`;
  - `horas_gastas` = rastreado; `horas_apontadas` = soma de worklogs; `horas_estimadas` = `original_estimate_seconds/3600`;
  - `bloqueado`, `motivo_bloqueio`, `etiquetas`, `criado_em`, `atualizado_em`, `concluido_em` (= `resolved_at`).
- `GET /cards/{id}/historico`: `{campo, de, para, quando, quem}` para status, responsável, sprint, bloqueio, pausa.
- `GET /horas` (`projeto, pessoa, de, ate, updated_since`): união de `TrackedTimeEntry` (`fonte: "rastreado"`) e Worklog (`fonte: "manual"`); `id` prefixado (`r_`/`m_`), `pessoa_id, card_id, projeto_id, data, horas, descricao, fonte`.
- `GET /sprints` (`projeto, status`): status planned/active/closed → `planejada/em_andamento/encerrada`; `cards_planejados` = cards na sprint em `started_at` (histórico de `sprint_id`); `cards_concluidos` = planejados resolvidos até `completed_at` (ou agora).
- `GET /pessoas`: membros do workspace → `id, nome, squad, papel, ativo`. Nunca e-mail, telefone, endereço, custo.

## 4. Webhooks (etapa 3)

- `WebhookOutboxModel` (`id_evento` uuid, evento, recurso, dados, tentativas, próxima tentativa, entregue_em), gravado na mesma transação do evento.
- Eventos: `card.criado`, `card.status_alterado` (`de`, `para`), `card.bloqueado` (motivo), `sprint.encerrada` (planejados × concluídos).
- Worker `manage.py entregar_webhooks --loop` (serviço novo no compose da VPS): POST JSON, header `X-Office-Signature` = HMAC-SHA256 hex do corpo (`AGENT_WEBHOOK_SECRET`), backoff exponencial até 24h; não-2xx reagenda.

## Entrega

1. Seção 1 + campos de projeto/card necessários + `/projetos`, `/cards`, `/horas`.
2. `/historico`, `/sprints`, `/pessoas`.
3. Webhooks.

## Testes

pytest por rota cobrindo o critério de aceite do Leonardo (§7): health sem token, 401s, envelope, 403 `somente_leitura` em POST/PUT/PATCH/DELETE + linha na auditoria, paginação e `updated_since`, ausência de campos pessoais, path traversal → 404.

## Para mandar ao Leonardo

URL `https://office.t4egroup.com.br/api/agentes/v1`, `openapi.json`, comando de importação dos hashes, segredo HMAC por canal seguro, lista de status (slugs por quadro + `status_categoria`).
