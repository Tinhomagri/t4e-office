# ADR 0001 — Arquitetura DDD por bounded context

**Status:** Aceito · 2026-06-25

## Contexto

O produto cresce em direção a um Jira: identidade, projetos, cards, sprints, IA,
integrações (GitHub, Google). Um único app Django com models/views infláveis viraria
big ball of mud. O challenge pontua arquitetura e capacidade de defender decisões.

## Decisão

Organizar o backend em **bounded contexts** (`identity`, `projects`, `copilot`,
`github`, `google`, `estimation`), cada um com quatro camadas:

```
contexts/<ctx>/
├─ domain/         # entities, value_objects, repositories (portas) — Python puro
├─ application/    # use_cases (orquestram regras de negócio)
├─ infrastructure/ # django/models.py (ORM) + repositories_impl.py
└─ interface/      # api/ (views finas, serializers, urls)
```

Regras: domínio não importa Django; ORM confinado à infraestrutura; views finas
delegam a use cases; dependências apontam para dentro (interface → application → domain).

## Consequências

- (+) Regras de negócio testáveis sem banco; contextos evoluem isolados.
- (+) Facilita explicar/defender o código na apresentação.
- (−) Mais boilerplate e indireção que um CRUD Django puro.
- Mitigação: DDD **pragmático** — não criamos camada onde não há regra (CRUD simples
  pode ir direto ao repositório).
