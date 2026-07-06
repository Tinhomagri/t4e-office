# ADR 0004 — Postgres em prod, SQLite em dev

**Status:** Aceito · 2026-06-25

## Contexto

O challenge exige migrations e um ambiente deployado. Avaliadores precisam subir o
projeto localmente com atrito mínimo, mas produção precisa de um banco robusto.

## Decisão

- **Dev:** SQLite por padrão (`.env` default) — zero setup, roda com `migrate` + `runserver`.
- **Prod:** PostgreSQL (via `psycopg`), configurado por `DATABASE_URL` em `config.settings.prod`.
- Migrations versionadas e obrigatórias; nada de `--fake` para pular schema.
- Docker Compose sobe web + Postgres + Redis para reproduzir prod localmente.

## Consequências

- (+) Avaliador roda em segundos sem instalar Postgres.
- (+) Paridade dev/prod disponível via Docker quando necessário.
- (−) Risco de divergência SQLite↔Postgres (tipos, constraints). Mitigação: CI e testes
  de integração rodam contra Postgres antes de features sensíveis a banco.
