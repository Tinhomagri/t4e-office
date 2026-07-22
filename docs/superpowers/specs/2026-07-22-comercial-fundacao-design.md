# Fundação Comercial — Clientes + Pipeline

**Data:** 2026-07-22
**Status:** Aprovado
**Sub-projeto:** 1 de 3 (Fundação → Propostas → Métricas)

## Contexto

O T4E Office cobre gestão de projetos (Jira-like), marketing, colaboração e IA,
mas não tem nada para o time comercial. O objetivo final é um CRM completo:
pipeline de vendas, gestão de clientes, propostas/orçamentos e métricas/metas.

Esse escopo abrange subsistemas independentes demais para um único spec, então
foi decomposto em três sub-projetos sequenciais:

1. **Fundação: Clientes + Pipeline** (este documento) — base de dados e fluxo
   que os outros dois consomem.
2. **Propostas/Orçamentos** — depende dos deals existirem.
3. **Métricas & Metas** — depende do histórico de deals.

Este spec cobre apenas o sub-projeto 1.

## Decisões

| Decisão | Escolha | Motivo |
|---|---|---|
| Modelo de cliente | Empresa **ou** pessoa física, contatos opcionais | Time vende para os dois |
| Deal ganho | Gera projeto de entrega vinculado | Conecta comercial → operação; diferencial da plataforma |
| Estágios do funil | Padrão editável (renomear/reordenar/adicionar) | Mesmo padrão do workflow dos boards |
| Funis múltiplos | Fora de escopo no v1 | YAGNI |
| Campos do deal | Data prevista, probabilidade, motivo de perda, origem | Todos pedidos pelo time |
| Atividades | Notas + tarefas com prazo + reunião no Google Calendar | Integração Google já existe |
| Arquitetura | Bounded context `sales` próprio | `CardModel` já sobrecarregado; fundação de 3 sub-projetos |

### Arquitetura: alternativas descartadas

**Reusar `projects` com `template="sales"`** — deals viram `CardModel` com custom
fields. Entrega mais rápido e ganha Kanban/comentários/histórico de graça, mas
`CardModel` já carrega epic, sprint, story points e channel; "cliente" não teria
lugar natural e valor/probabilidade virariam custom fields. Dívida técnica na
fundação de três sub-projetos.

**Híbrido** — `sales` só para Customer/Contact, deals continuam cards. Divide o
domínio comercial em dois lugares sem resolver o problema do `CardModel`.

O reuso valioso é no **frontend** (componentes Kanban, drawer, camada de motion),
e esse acontece em qualquer uma das abordagens.

## Arquitetura

Novo bounded context `contexts.sales`, espelhando `contexts.projects`:

```
backend/src/contexts/sales/
├── domain/
│   ├── entities/       customer.py, contact.py, deal.py, stage.py, activity.py
│   ├── repositories/   interfaces abstratas, uma por agregado
│   └── value_objects/  money.py, probability.py
├── application/use_cases/
├── infrastructure/django/   models.py + implementações de repositório
├── migrations/
└── interface/api/      views, serializers, urls, permissions, tests/
```

Registro:

- `"contexts.sales"` em `INSTALLED_APPS` (`src/config/settings/base.py`)
- `path("api/sales/", include("contexts.sales.interface.api.urls"))` em
  `src/config/urls.py`

### Fronteira entre contextos

`sales` **não importa models de `projects`**. A criação do projeto de entrega
acontece num use case de `sales` que chama o use case `create_project` de
`projects`. A mesma regra vale para `google`: o agendamento de reunião chama o
use case do contexto `google`, não sua infraestrutura.

## Modelo de dados

**Customer** — `workspace` (FK), `kind` (`company`|`person`), `name`,
`legal_name`, `document` (CNPJ/CPF), `email`, `phone`, `website`, `notes`,
`owner` (FK user), `created_at`, `updated_at`.

**Contact** — `customer` (FK), `name`, `role`, `email`, `phone`, `is_primary`.
Na prática só usado quando `customer.kind == "company"`, mas o modelo não impede
contatos em pessoa física.

**PipelineStage** — `workspace`, `name`, `slug`, `color`, `order`,
`probability_default` (0–100), `kind` (`open`|`won`|`lost`).

Seed padrão por workspace: Lead, Qualificação, Proposta, Negociação,
Ganho (`kind=won`), Perdido (`kind=lost`). Renomeável, reordenável, adicionável —
mesmo padrão do `WorkflowStatus`. Deve existir exatamente um estágio `won` e um
`lost`; a camada de aplicação impede remover o último de cada tipo.

**Deal** — `workspace`, `title`, `customer` (FK), `contact` (FK nullable),
`stage` (FK), `amount` (Decimal), `currency` (default `BRL`), `probability`
(0–100), `expected_close_date`, `source`, `owner` (FK user), `lost_reason`,
`lost_notes`, `won_at`, `lost_at`, `delivery_project` (FK nullable para
`ProjectModel`), `rank` (ordenação no Kanban, mesmo esquema dos cards),
`created_at`, `updated_at`.

**DealActivity** — `deal` (FK), `kind` (`note`|`task`|`meeting`), `content`,
`author` (FK user), `due_date` (tasks), `assignee` (FK user, tasks), `done_at`,
`google_event_id` (meetings), `created_at`.

**DealHistory** — `deal`, `author`, `field`, `from_value`, `to_value`, `at`.
Mesmo padrão de `CardHistoryModel`.

## Fluxos

**Mover de estágio** (`move_deal_stage`) — valida o estágio destino, atualiza
`probability` para o default do novo estágio **apenas se** o valor atual ainda
era o default do estágio anterior (edição manual do usuário é preservada),
grava histórico.

**Ganhar** (`win_deal`) — marca `won_at`, move para o estágio `kind=won`. Recebe
uma flag `create_delivery_project`; quando verdadeira, chama `create_project`
derivando nome e key do deal e do cliente, e grava o FK `delivery_project`.
Idempotente: se `delivery_project` já existe, não cria outro.

**Perder** (`lose_deal`) — exige `lost_reason`, grava `lost_at`, move para o
estágio `kind=lost`.

**Agendar atividade** (`schedule_activity`) — com `kind="meeting"` chama o
contexto `google` e guarda o `google_event_id`. Se o usuário não tem Google
conectado, cria a atividade sem evento e retorna um aviso; não bloqueia.

**Follow-ups no "Hoje"** — atividades `kind="task"` com `due_date` e `assignee`
aparecem no feed do `today` existente.

## Frontend

Nova feature em `frontend/src/features/sales/`:

- `SalesPage.tsx` — shell com abas: Pipeline · Clientes · Atividades
- `views/PipelineView.tsx` — Kanban de deals com dnd-kit, reusando os padrões do
  `KanbanView`: `DragOverlay` com tilt, `settleSpring` no drop, `dropZone` nas
  colunas (tudo em `shared/lib/motion.ts`). Cabeçalho de coluna mostra contagem,
  soma do valor e soma ponderada (valor × probabilidade).
- `DealDrawer.tsx` — detalhe do deal com autosave por campo (padrão do
  `CardDrawer`), timeline de atividades, ações Ganhar/Perder. Ganhar abre um
  modal perguntando se cria o projeto de entrega; perder exige o motivo.
- `views/CustomersView.tsx` + `CustomerDrawer.tsx` — cadastro, contatos e deals
  do cliente.
- `sales.api.ts`, `sales.hooks.ts`, `sales.types.ts` — padrão de
  `workspace.hooks.ts`.
- Item "Comercial" no `NAV_GROUPS` do `AppShell`.

Responsivo desde o início (drawer/nav mobile, alvos de toque ≥44px) e usando
`shared/ui/primitives.tsx`.

## Erros e permissões

Erros seguem o handler de domínio existente, retornando `{"error": "..."}`, que
o `QueryCache`/`MutationCache` do `main.tsx` já transforma em toast global.

Permissões por workspace, reusando o padrão de
`contexts/projects/interface/api/permissions.py`. Um deal só é visível para
membros do workspace dono.

## Testes

**Backend** — testes de use case cobrindo: mover estágio (com e sem
probabilidade editada), ganhar com e sem criação de projeto, idempotência da
criação, perder sem motivo (deve falhar), agendar reunião sem Google conectado.
Testes de API em `interface/api/tests/`, seguindo o padrão do contexto
`projects`.

**Frontend** — teste dos hooks/store e um smoke test do `PipelineView`.
Referências: `board.prefs.store.test.ts` e `SubmitButton.test.tsx`.

## Fora de escopo

Propostas e orçamentos (sub-projeto 2). Dashboard de metas, comissões e ranking
(sub-projeto 3). Funis múltiplos. Importação de leads. Automações de e-mail.
