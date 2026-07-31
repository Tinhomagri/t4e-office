# T4E Office

Sistema de gerenciamento de projetos estilo Jira/Linear — **T4E Dev Challenge 2026**.
Kanban customizável, sprints, cards com histórico, dashboard de métricas, notificações
in-app e um copiloto de IA (Claude/OpenAI) integrado por workspace.

> Backend **Django 5 + DRF** com arquitetura **DDD** por bounded context.
> Frontend **React + TypeScript + Vite + Tailwind**.

---

## Sumário

- [Requisitos atendidos](#requisitos-atendidos-rf-01rf-06)
- [Stack](#stack)
- [Setup rápido](#setup-rápido)
- [Seed de avaliação](#seed-de-avaliação)
- [Testes](#testes)
- [Arquitetura](#arquitetura)
- [Deploy](#deploy)
- [Documentação](#documentação)

---

## Requisitos atendidos (RF-01..RF-06)

| RF | Requisito | Onde |
|----|-----------|------|
| RF-01 | Autenticação, perfis com avatar, papéis admin/membro | contexto `identity` (JWT, `MembershipModel.role`) |
| RF-02 | Workspace, convites de membros, múltiplos projetos | `identity` (Workspace/Membership/Invitation) |
| RF-03 | Boards Kanban customizável + visão lista/tabela | `projects` (`WorkflowStatusModel`) + frontend `@dnd-kit` |
| RF-04 | Cards completos, comentários, histórico | `projects` (`CardModel`, `CardCommentModel`, `CardHistoryModel`) |
| RF-05 | Dashboard por status/prazo/responsável | frontend "Meu Dia" + endpoints de métricas |
| RF-06 | Notificação in-app ao atribuir/mencionar | `projects` (`NotificationModel`) |

**Diferenciais implementados:** copiloto IA, integração GitHub (OAuth+webhook), integração
Google (Calendar/Meet), busca/filtros salvos, sub-tarefas e dependências, upload de anexos,
tags/componentes/versões, dark/light, responsivo.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, TanStack Query, @dnd-kit, TipTap |
| Backend | Python 3.11+, Django 5, Django REST Framework, SimpleJWT |
| Banco | SQLite (dev) · PostgreSQL (prod) — migrations obrigatórias |
| IA | Anthropic Claude + OpenAI (por workspace) |
| Infra | Docker Compose (web + Postgres + Redis) |

---

## Setup rápido

Pré-requisitos: Python 3.11+, Node 18+.

### Backend

```bash
cd backend
cp .env.example .env          # default: sqlite; ajuste GOOGLE_*/AI keys se for testar
pip install -e ".[dev]"
python manage.py migrate
python manage.py seed_demo     # popula dados de avaliação (ver abaixo)
python manage.py runserver     # http://localhost:8000  · Swagger em /api/docs/
```

### Frontend

```bash
cd frontend
npm install
npm run dev                    # http://localhost:5173
```

### Docker (Postgres + Redis)

```bash
cd backend && cp .env.example .env && docker compose up --build
```

Variáveis sensíveis vão em `.env` (nunca commitado). Veja `backend/.env.example`.

---

## Seed de avaliação

```bash
python manage.py seed_demo
```

Cria workspace **Demo T4E**, um projeto `DEMO` com sprint ativa e 8 cards distribuídos
pelas colunas, além de notificações de exemplo. Usuários (senha `demo1234`):

| Email | Papel |
|-------|-------|
| `admin@t4e.dev` | owner / admin |
| `ana@t4e.dev` | member |
| `bruno@t4e.dev` | member |

O comando é **idempotente** — rodar de novo não duplica dados.

---

## Testes

Rodam no CI a cada push/PR (`.github/workflows/ci.yml`).

**Backend** (pytest — **454 testes** em 42 arquivos):

```bash
cd backend
pytest -q                                    # unit + integração
pytest --cov=src --cov-report=term-missing   # cobertura por arquivo
```

Cobre use cases de identidade, permissões de projeto, ágil (Lexorank/épicos/sprints),
notificações (RF-06), filtros salvos, documentos, copiloto, regras do Planning Poker
e fluxo OAuth Google.

**Frontend** (Vitest + Testing Library — **495 testes** em 54 arquivos):

```bash
cd frontend
npm test                       # unit (utils, stores, avatar) + componente
npm run test:coverage
```

13 desses arquivos renderizam componente de verdade com Testing Library (board, Meu Dia,
escritório, Win98Desktop); o resto cobre regra pura — reducers, stores, projeção
isométrica e formatação.

**Cobertura:** o CI roda `pytest --cov=src --cov-report=term-missing` a cada push e PR, e o
relatório por arquivo fica na saída do job *Backend (lint + tests)*. Para reproduzir local,
é o mesmo comando — não há passo extra nem serviço externo.

Atalho: `make test` roda os dois.

---

## Arquitetura

DDD pragmático, quatro camadas por bounded context (domínio Python puro, ORM confinado
à infraestrutura, ports/repositories). Contextos: `identity`, `projects`, `copilot`,
`github`, `google`, `estimation`.

Detalhes e decisões em [`docs/adr/`](docs/adr/) e [`docs/`](docs/).

---

## Deploy

Aplicação publicada em: **https://t4e-office.vercel.app**

Backend e frontend saem do mesmo deploy na Vercel: o frontend é build estático
(`npm run build`) e o Django roda como função serverless sob `/api/` (ver `vercel.json` e
`api/`). Banco: Postgres gerenciado.

Credenciais de avaliação e dados de exemplo: ver [Seed de avaliação](#seed-de-avaliação).

---

## Documentação

- [`backend/README.md`](backend/README.md) — detalhes do backend e endpoints
- [`docs/adr/`](docs/adr/) — Architecture Decision Records
- [`docs/`](docs/) — designs de features (Pulse, Meu Dia, Google)
- [`PROMPTS.md`](PROMPTS.md) — registro do uso de IA no desenvolvimento

## Screenshots

> _(adicionar prints do board Kanban, dashboard "Meu Dia" e copiloto antes da entrega)_
