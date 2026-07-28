# Chatwoot — referência de API para integração no Comercial

Compilado de https://developers.chatwoot.com (API reference, self-hosted, contributing guide, handbook, user guide).

## Tipos de API

| Tipo | Uso | Auth |
|---|---|---|
| **Application API** | operações de agente/admin (conversas, contatos, relatórios) — é a que vamos usar | header `api_access_token` (gerado em Profile Settings do agente, ou de um Agent Bot) |
| **Client API** | construir chat widget custom para o end-user | `inbox_identifier` + `contact_identifier` (sem token de agente) |
| **Platform API** | administrar instalações (usuários, contas, SSO) — só self-hosted/managed | `access_token` de um Platform App (Super Admin Console) |

Base path da Application API: `/api/v1/accounts/{account_id}/...`
Base path da Client API (pública, sem auth): `/public/api/v1/inboxes/{inbox_identifier}/contacts/{contact_identifier}/...`

## Stack de referência (self-hosted)
Rails + Vue.js + PostgreSQL + Redis. Requisitos mínimos: 2 vCPU / 4GB RAM / 20GB SSD; produção: 4+ vCPU / 8GB+ RAM / 50GB+ SSD, Postgres 12+, Redis 6+. SMTP obrigatório para notificação por e-mail.

---

## Endpoints relevantes pro inbox de chat comercial

### Conversas

**Listar** — `GET /api/v1/accounts/{account_id}/conversations`
Query: `assignee_type` (me|unassigned|all|assigned), `status` (all|open|resolved|pending|snoozed), `q`, `inbox_id`, `team_id`, `labels[]`, `page`.
Campos da conversa: `id, uuid, account_id, inbox_id, status, priority, labels, custom_attributes, assignee_last_seen_at, contact_last_seen_at, agent_last_seen_at, unread_count, can_reply, muted, created_at, updated_at, last_activity_at`.

**Filtrar (avançado)** — `POST /api/v1/accounts/{account_id}/conversations/filter`
```json
{
  "payload": [
    { "attribute_key": "status", "filter_operator": "equal_to", "values": ["pending"], "query_operator": null }
  ]
}
```
`filter_operator`: equal_to | not_equal_to | contains | does_not_contain. `query_operator`: AND | OR (null no último item).

**Criar conversa (client, sem auth)** — `POST /public/api/v1/inboxes/{inbox_identifier}/contacts/{contact_identifier}/conversations`
Body: `{ "custom_attributes": {} }` (nada obrigatório).

**Atribuir** — `POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/assignments`
Body: `{ "assignee_id": 1 }` ou `{ "team_id": 1 }` (assignee_id tem prioridade).

**Custom attributes na conversa** — `POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/custom_attributes`
Body: `{ "custom_attributes": { "order_id": "12345" } }` — bom p/ linkar conversa a um Deal do módulo Sales.

Outros: `toggle-priority`, `toggle-status`, `add-labels`, `update-conversation`.

### Mensagens

**Criar (client, sem auth)** — `POST /public/.../conversations/{conversation_id}/messages`
Body: `{ "content": "string", "echo_id": "opcional" }`.
`message_type`: 0=incoming, 1=outgoing, 2=activity, 3=template.

**Criar (application API)** — `POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages` — mesma ideia, mas como agente (suporta `private`, `content_attributes`, anexos).

### Contatos

**Criar** — `POST /api/v1/accounts/{account_id}/contacts`
Body: `inbox_id (obrigatório), name, email, phone_number, blocked, identifier, additional_attributes, custom_attributes`.

**Buscar** — `GET /api/v1/accounts/{account_id}/contacts/search?q=...&sort=...&page=...`
Retorna `payload[]` com `id, name, email, phone_number, identifier, blocked, availability_status, custom_attributes, additional_attributes, contact_inboxes[]`.

Outros: `list-contacts`, `merge-contacts`, `contact-conversations`, `contact-filter`.

### Inboxes

**Listar** — `GET /api/v1/accounts/{account_id}/inboxes`
Campos: `id, name, channel_type, medium, provider, avatar_url, website_url, phone_number, enable_auto_assignment, working_hours_enabled, timezone`.

### Labels

**Criar** — `POST /api/v1/accounts/{account_id}/labels`
Body: `{ "title", "description", "color" (#hex), "show_on_sidebar" }`.

### Custom Attribute Definitions (schema, não valor)

**Criar** — `POST /api/v1/accounts/{account_id}/custom_attribute_definitions`
Body:
```json
{
  "attribute_display_name": "Priority Level",
  "attribute_key": "priority_level",
  "attribute_display_type": 6,
  "attribute_model": 0,
  "attribute_values": ["high", "medium", "low"]
}
```
`attribute_display_type`: 0=text, 1=number, 2=currency, 3=percent, 4=link, 5=date, 6=list, 7=checkbox.
`attribute_model`: 0=conversation_attribute, 1=contact_attribute.

### Webhooks

**Criar** — `POST /api/v1/accounts/{account_id}/webhooks`
Body: `{ "url", "name", "subscriptions": [...] }`.
Eventos disponíveis: `conversation_created, conversation_status_changed, conversation_updated, message_created, message_updated, contact_created, contact_updated, webwidget_triggered, conversation_typing_on, conversation_typing_off`.
Segurança: payload assinado com `X-Chatwoot-Signature` (HMAC-SHA256) + `X-Chatwoot-Timestamp`.

### Relatórios
`GET .../reports/*` — métricas de conversa por conta/agente/inbox/canal/time, CSAT, tempo de primeira resposta, matriz inbox×label.

---

## Como isso mapeia pro Comercial (t4e-office)

- `frontend/src/features/sales/` já tem `DealDrawer`, `CustomerDrawer`, pipeline de estágios (`ManageStagesModal`, `PipelineView`). Um inbox estilo Chatwoot entraria como view nova (`ConversationsView`) dentro de `SalesLayout`, reaproveitando o padrão de drawer.
- Ligação natural: **conversation.custom_attributes.deal_id** → aponta pro Deal no pipeline; webhook `conversation_created`/`message_created` dispara update no feed "My Day" (`sales.hooks.ts`) e endpoint de follow-up já existente.
- Se for consumir a API real do Chatwoot (self-hosted, via Docker) o backend Django precisa só de um client HTTP (`api_access_token` em header) — não tem SDK oficial Python, é REST puro.
- Se for **replicar a UI** sem integrar o Chatwoot de verdade, os campos acima (status, priority, labels, assignee, unread_count) são o contrato mínimo pra copiar a experiência de inbox (lista + filtro + badge de contagem).

Falta decidir: **integração real com instância Chatwoot** (self-hosted, roda via Docker, precisa infra própria) vs. **só réplica visual/funcional do padrão de inbox** dentro do Comercial sem depender do Chatwoot rodando. Isso muda MUITO o escopo — a doc não cobre isso porque é decisão de produto.
