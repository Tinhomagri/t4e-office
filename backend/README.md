# T4E Office — Backend (Pulse)

Django 5 + DRF, arquitetura DDD pragmática (domínio puro, ORM confinado à infra,
Repository/portas). Organização por bounded context com 4 camadas.

## Contextos (Fundação)

- `identity` — User (email+senha, AbstractBaseUser), Workspace, Membership, Invitation
- `projects` — Project escopado a Workspace

Estrutura de cada contexto:

```
contexts/<ctx>/
├─ domain/         # entities, value_objects, repositories (portas) — Python puro
├─ application/    # use_cases (orquestram regras)
├─ infrastructure/ # django/models.py (ORM) + repositories_impl.py
└─ interface/      # api/ (views finas, serializers, urls)
```

## Rodar local (sem Docker)

```bash
cp .env.example .env          # ajuste se necessário (default: sqlite)
pip install -e ".[dev]"       # ou --break-system-packages
python manage.py migrate
python manage.py runserver
```

## Rodar com Docker (Postgres + Redis)

```bash
cp .env.example .env
docker compose up --build     # web + db + redis
# worker de filas (uso adiado): docker compose --profile workers up celery
```

## Endpoints (Fundação)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/register/` | Cadastro |
| POST | `/api/auth/login/` | Login (email+senha) → JWT |
| POST | `/api/auth/refresh/` | Renova access token |
| GET  | `/api/auth/me/` | Usuário autenticado |
| POST | `/api/auth/workspaces/` | Cria workspace (criador = owner) |
| POST | `/api/projects/` | Cria projeto no workspace |
| GET  | `/api/projects/?workspace_id=` | Lista projetos do workspace |
| GET  | `/api/docs/` | Swagger UI (schema OpenAPI) |

## Testes

```bash
pytest -q
```

## Notas de arquitetura

- **Real-time/filas** (Redis/Celery/Channels) estão no compose e nas deps, mas
  com **uso adiado** — só entram quando Presença (Escritório Virtual) e Planning
  Poker forem implementados. A Fundação roda com web+db.
- **Hierarquia**: doc de visão prevê 6 níveis a partir de Projeto; a Fundação
  implementa apenas Workspace + Project (decisão de MVP).
