# Pulse — Arquitetura de Referência (Todos os Módulos)

> Documento fundacional de arquitetura. Define os bounded contexts, modelo de
> dados, camadas DDD, tempo real, segurança e roadmap de implementação.
> Fonte de verdade para todo o desenvolvimento faseado.
>
> Data: 2026-06-27 · Stack: Django 5.2 + DRF + DDD · React 18 + TS strict + Vite

---

## 1. Princípios de arquitetura (inegociáveis)

1. **O domínio não conhece o framework.** Entidades em Python puro. `django.db`
   nunca aparece em `domain/` ou `application/`. A seta de dependência aponta
   sempre para dentro (interface → application → domain; infrastructure → domain).
2. **Bounded context autossuficiente.** Cada contexto tem as 4 camadas
   (`domain`, `application`, `infrastructure`, `interface`) e não importa o
   domínio de outro contexto. Contextos conversam por **portas** (interfaces) e
   IDs, nunca por ORM cruzado.
3. **Segurança no caso de uso, não na view.** Toda autorização (papel, escopo de
   workspace, posse do recurso) é checada na camada `application`, com a view
   apenas traduzindo HTTP. Defesa em profundidade: serializer valida forma, use
   case valida regra + permissão.
4. **Transação em escrita multi-passo.** Tudo que grava em mais de um lugar roda
   dentro de `transaction.atomic()`.
5. **Paginação obrigatória.** Todo endpoint de lista pagina. Sem exceção.
6. **Segredos fora do código.** Tudo em env. `.env` nunca commitado.
7. **Otimista por padrão no front.** A UI atualiza antes do servidor confirmar
   (React Query optimistic updates) e reconcilia na resposta.
8. **Tipos gerados do OpenAPI.** O front não redigita tipos do back; gera do
   schema DRF (drf-spectacular).

---

## 2. Mapa de bounded contexts

| Contexto | Responsabilidade | Estado hoje |
|---|---|---|
| `identity` | Usuários, auth (JWT), workspaces, membros, papéis, convites | **Existe** (parcial) |
| `projects` | Projetos, hierarquia, cards, sprints, boards, views, filtros | **Existe** (só Project + Card básico) |
| `estimation` | Planning Poker (sessões, votos, baralhos, convergência) | **Falta** |
| `presence` | Escritório Virtual 2D (avatares, status, salas, proximidade) | **Falta** |
| `reporting` | Métricas de fluxo, status automático, portfólio, "pergunte aos dados" | **Falta** |
| `copilot` | IA: ler documentos/transcrições → análise → cards | **Existe** |
| `automation` | Motor de regras sem código (Gatilho → Condição → Ação) | **Falta** |
| `notifications` | Menções, alertas, entrega in-app/email, preferências | **Falta** |

**Infra compartilhada** (`shared/` + `config/`): kernel de erros, value objects
base, exception handler, autenticação JWT, camada de tempo real (Channels),
fila assíncrona (Celery), event bus interno (domain events).

### 2.1 Regras de comunicação entre contextos

- **Síncrona por porta:** ex. `copilot` cria cards via porta `TaskCreator`
  implementada por `projects` (já é assim). `estimation` grava pontos no card via
  porta `CardEstimator` de `projects`.
- **Assíncrona por evento:** ex. `CardEstimado`, `CardConcluido`,
  `SprintEncerrada` publicados num event bus → `reporting` e `automation`
  consomem. Desacopla quem produz de quem reage.
- **Nunca** importar `contexts.projects.infrastructure.django.models` de outro
  contexto. Referência cruzada só por UUID + porta.

---

## 3. Modelo de dados (núcleo)

### 3.1 Identity

```
User(id:uuid, email[unique], full_name, password_hash, is_active, created_at)
Workspace(id:uuid, name, slug[unique], owner_id, created_at)
Membership(id, workspace_id, user_id, role[owner|admin|member], created_at)
  unique(workspace_id, user_id)
Invitation(id, workspace_id, email, role, token[unique], status[pending|accepted|revoked], invited_by, expires_at)
EmailVerification / PasswordReset(token, user_id, expires_at)  # já existem
```

### 3.2 Projects (núcleo de execução — maior expansão)

Hierarquia do doc §2: seis níveis opcionais a partir de Projeto. MVP pragmático:
**Workspace → Project → Sprint(opcional) → Card → Subcard** (card filho-de-card),
com espaço reservado para níveis intermediários (Módulo/Épico) como `parent_id`
recursivo no próprio Card via `type`.

```
Project(id:uuid, workspace_id, key[2-10 letras, unique no workspace], name,
        description, lead_id, archived, created_at)
  next_card_number  # sequência por projeto → ref "MIA-142"

Sprint(id:uuid, project_id, name, goal, start_date, end_date,
       status[planned|active|closed], created_at)

Card(id:uuid, project_id, number[seq por projeto], title, description[rich],
     status[backlog|todo|doing|review|done], type[feature|bug|spike|debt|chore],
     priority[low|medium|high|urgent],
     story_points[nullable], hours_estimate[nullable], confidence[nullable],
     assignee_id, sprint_id[nullable], parent_id[nullable, self-FK p/ subcard],
     order[float, p/ ordenação drag-drop], start_date, due_date,
     lead_time/cycle_time[derivados], source[manual|copilot], created_at)
  unique(project_id, number)

CardRelation(id, from_card, to_card, kind[blocks|blocked_by|duplicates|relates|child_of])
CardReviewer(card_id, user_id)        # revisores
CardWatcher(card_id, user_id)         # observadores
Checklist(id, card_id, title) / ChecklistItem(id, checklist_id, text, done, order)
Comment(id, card_id, author_id, body[rich], created_at) + mentions[user_ids]
Attachment(id, card_id, file, name, uploaded_by, created_at)
Label(id, project_id, name, color) / CardLabel(card_id, label_id)
CustomField(id, project_id, name, kind[dropdown|number|formula|rating|progress|relation], config:json)
CustomFieldValue(card_id, field_id, value:json)
SavedView(id, project_id|workspace_id, owner_id, name, kind[board|list|table|calendar|timeline],
          filters:json, shared:bool)
```

**Ordenação drag-drop:** campo `order` float; mover card recalcula entre vizinhos
(média) e re-balanceia em background quando colisão. Evita reescrever todos.

### 3.3 Estimation (Planning Poker)

```
PokerSession(id:uuid, project_id, facilitator_id, deck[fibonacci|tshirt|...],
             status[open|voting|revealed|closed], current_card_id, created_at)
PokerQueueItem(session_id, card_id, order, estimated[bool])
Vote(id, session_id, card_id, user_id, value, revealed[bool], created_at)
  unique(session_id, card_id, user_id)  # 1 voto por pessoa por card
```

**Concorrência (doc §8.1):** revelação simultânea = lock no Redis. Votos
guardados com `revealed=false`; ninguém lê valores alheios até o facilitador (ou
"todos votaram") disparar a revelação. Estado distribuído via Channels.

### 3.4 Presence (Escritório Virtual)

```
OfficeMap(id, workspace_id, name, layout:json)         # salas, mesas, paredes
Room(id, map_id, kind[team|meeting|focus|social|poker], name, bounds:json)
PresenceState(user_id, workspace_id, x, y, room_id, status[available|focus|meeting|away],
              avatar:json, last_heartbeat)  # efêmero (Redis), snapshot no Postgres
```

Estado de presença vive no **Redis** (efêmero, alta frequência) com heartbeat +
reconciliação no servidor (doc §8.1). Postgres só guarda mapa/salas/avatar.

### 3.5 Reporting

Contexto **read-model**: não tem entidades próprias de escrita; consome eventos e
materializa métricas.

```
FlowMetricSnapshot(id, project_id, period, throughput, cycle_time_p50/p85,
                   wip, created_at)            # materializado por job
ExecutiveSummary(id, project_id, period, body[texto IA], generated_at)
```

"Pergunte aos seus dados" e "status que se escreve sozinho": geração via copilot
(porta de IA) sobre os read-models + cache (doc §8.1 custo de IA).

### 3.6 Automation

```
AutomationRule(id, workspace_id|project_id, name, enabled, trigger:json,
               conditions:json, actions:json, created_by, created_at)
AutomationRun(id, rule_id, triggered_by_event, status, log:json, ran_at)
```

Consome o event bus. Gatilho → Condição → Ação, sem código.

### 3.7 Notifications

```
Notification(id, user_id, kind[mention|assigned|blocked|risk|poker_invite|...],
             payload:json, read[bool], created_at)
NotificationPreference(user_id, kind, in_app[bool], email[bool])
```

---

## 4. Camadas DDD (padrão por contexto)

```
contexts/<ctx>/
├─ domain/
│  ├─ entities/          # dataclasses Python puro + invariantes (__post_init__)
│  ├─ value_objects/     # tipos imutáveis (Email, Slug, Points...)
│  ├─ events/            # domain events (CardEstimado, SprintEncerrada...)
│  ├─ ports/             # interfaces de serviços externos (EmailSender, AiAnalyzer...)
│  └─ repositories/      # interfaces de persistência (CardRepository...)
├─ application/
│  └─ use_cases/         # 1 classe por caso de uso; orquestra, checa permissão
├─ infrastructure/
│  └─ django/
│     ├─ models.py       # ORM
│     ├─ repositories_impl.py
│     └─ migrations/
└─ interface/
   └─ api/               # views finas, serializers, urls
```

**Regra de ouro:** use case recebe repositórios/portas por injeção no `__init__`
(testável com fakes, sem DB — padrão já usado nos testes atuais).

---

## 5. Tempo real, assíncrono e eventos

- **Channels (WebSocket):** Poker (revelação, votos), Presence (movimento,
  status), Notifications (push in-app), "quem está olhando agora" no card.
  Camada em `config/` + consumers por contexto. **Uso adiado** até as fases de
  Poker/Presença (já decidido) — Redis/Channels ficam nas deps.
- **Celery:** jobs assíncronos — materializar métricas (`reporting`), rodar
  automações pesadas, análise de IA de documento longo, envio de email,
  recálculo de previsão. Evento dispara job sem travar a resposta (doc §12.5).
- **Event bus interno:** publisher simples (in-process → depois Celery/Redis) que
  entrega domain events aos assinantes. Mantém contextos desacoplados.

---

## 6. Segurança (transversal)

| Camada | Controle |
|---|---|
| Transporte | HTTPS em prod; CORS restrito por env |
| Auth | JWT SimpleJWT (access curto + refresh); rotação de refresh |
| Authz | RBAC por papel (owner/admin/member) **no use case**; escopo de workspace em toda query (nunca confiar em ID do cliente sem checar posse) |
| Multi-tenant | Todo recurso resolve `workspace_id` e valida `Membership` do ator. `WorkspaceAccess` como porta reutilizável (já existe em copilot/projects) |
| Input | Serializer DRF valida forma; value objects validam invariante de domínio |
| Injeção | ORM parametrizado; sem string SQL crua |
| Segredos | env/.env; `ANTHROPIC_API_KEY`, JWT signing key, DB creds |
| Rate limit | DRF throttling em auth (login/register/reset) e endpoints de IA |
| Enumeração | Forgot-password sempre 200 (já feito); convites por token opaco `secrets.token_urlsafe` |
| Upload | Validar tipo/tamanho de anexos; storage isolado; nome saneado |
| Auditoria | `created_by`/timestamps; `AutomationRun`/eventos como trilha |
| Paginação | Limite default + máximo por endpoint (anti-OOM/DoS) |

**Princípio:** o cliente nunca decide autorização. Toda leitura/escrita filtra
por workspace do usuário autenticado.

---

## 7. Frontend (feature-first)

```
src/
├─ app/         # router, providers (React Query, auth gate)
├─ shared/
│  ├─ ui/       # design system: Button, Input, Modal, Card, Dialog, Select,
│  │           # Menu, Toast, Avatar, Badge, Skeleton, EmptyState (tokens P&B premium)
│  ├─ api/      # client axios + interceptors + tipos gerados do OpenAPI
│  └─ hooks/    # useAuth, useWebSocket, useOptimistic
└─ features/
   ├─ auth/  projects/  board/  poker/  office/  reports/  copilot/
   │  members/  today/  automation/  notifications/
   └─ cada uma: components/ hooks/ api.ts types.ts
```

**Dívida atual a pagar:** criar projeto/card via `window.prompt()` → substituir
por **modais do design system** com validação. Mover card via `<select>` →
**drag-and-drop** (dnd-kit). Sem detalhe de card → **drawer/modal rico**.
Eliminar `workspace.mock.ts` ainda referenciado no shell.

**Princípios de UX (doc §1.2):** ação principal < 100ms (otimista), inferir antes
de pedir, densidade com respiro, estética premium. Code-split por feature.

---

## 8. Roadmap faseado (cada fase = spec → plano → impl)

| Fase | Entrega | Contextos |
|---|---|---|
| **F1 — Execução** (próxima) | Modal de criar projeto + **Sprint/backlog** + board Kanban drag-drop (@dnd-kit) + modal de card rico (tipo/prioridade/responsável/pontos/descrição Tiptap) + view Lista + design system base + OpenAPI typegen. Mata o "zoado". | `projects` (expandir) + `shared/ui` |
| **F2 — Organização** | Subcards, relações, checklists, comentários+menções, custom fields, labels, saved views (table/calendar) | `projects` + `notifications` (menção) |
| **F3 — Meu Dia + Relatórios** | Agregados "Meu Dia", métricas de fluxo, status automático, portfólio, pergunte-aos-dados | `reporting` + `copilot` |
| **F4 — Planning Poker** | Sessões em tempo real, voto secreto, revelação com lock, registro no card | `estimation` + Channels |
| **F5 — Escritório Virtual** | Mapa 2D, avatares, status, salas, proximidade, áudio espacial | `presence` + Channels + SFU |
| **F6 — Automação + Inteligência** | Motor de regras sem código, previsão de entrega, detector de risco, balanceamento de carga | `automation` + `reporting` |

Copiloto (já existe) evolui dentro de F3/F6.

---

## 9. Qualidade e convenções

- **Testes:** use cases com repositórios fake (sem DB); smoke E2E por contexto;
  pytest. Front: typecheck strict + testes de componente nos críticos.
- **Lint/type:** ruff + mypy (back), tsc strict + eslint (front).
- **Migrations:** uma por mudança, nome descritivo.
- **OpenAPI:** drf-spectacular → gerar tipos TS (eliminar redigitação).
- **Regra do projeto:** sem `<form>` no front (usar onClick); `python3`;
  `pip --break-system-packages`.

---

## 10. Decisões travadas (2026-06-27)

1. **Drag-and-drop:** `@dnd-kit` — leve, acessível, mantida.
2. **Editor rich-text:** **Tiptap** para descrição e comentários (negrito, listas,
   menções). UX premium do doc.
3. **Hierarquia F1:** inclui **Sprint** já na F1 (Project → Sprint → Card → Subcard,
   com backlog). F1 maior, porém entrega execução completa.
4. **OpenAPI typegen:** **drf-spectacular agora** — schema DRF → tipos TS desde a
   F1, eliminando redigitação de tipos no front.

### 10.1 Impacto na F1 (escopo confirmado)

- Backend: expandir `projects` com Sprint (entidade+model+use cases+endpoints) e
  enriquecer Card (type/priority/points/assignee/description/order já existem;
  adicionar labels mínimas se couber). Instalar/configurar drf-spectacular +
  expor `/api/schema/`.
- Frontend: design system base (`shared/ui`: Modal/Dialog, Input, Select, Button,
  Badge, Avatar, Toast, Skeleton), board Kanban com `@dnd-kit`, modal de criar
  projeto, drawer/modal de card rico com **Tiptap**, view Lista, seletor de
  sprint/backlog. Gerar tipos do OpenAPI. Remover `window.prompt()` e
  `workspace.mock.ts`.
