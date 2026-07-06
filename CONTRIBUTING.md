# Contribuindo — T4E Office

Guia de contribuição para a dupla. Mantém `main` estável e o histórico limpo (critério
Git do challenge: branches consistentes, commits atômicos, PRs com contexto).

## Fluxo de trabalho (GitFlow leve)

1. Sempre partir de `main` atualizada.
2. Criar branch por tipo:
   - `feat/<escopo>` — nova funcionalidade
   - `fix/<escopo>` — correção
   - `chore/<escopo>` — build, deps, config
   - `docs/<escopo>` — documentação
   - `test/<escopo>` — testes
3. Commits **atômicos** e no padrão **Conventional Commits**:
   ```
   feat(boards): arrastar card entre colunas atualiza status
   fix(auth): expiração de token usava < em vez de <=
   ```
4. Abrir **PR** com contexto (o quê, por quê, como testar). Sem `wip` solto na `main`.
5. `main` só recebe código com testes passando (CI verde).

## Rodando localmente

Ver [README](README.md). Resumo:

```bash
# backend
cd backend && pip install -e ".[dev]" && python manage.py migrate && python manage.py seed_demo
# frontend
cd frontend && npm install && npm run dev
```

## Antes de abrir PR

```bash
cd backend && ruff check src && pytest -q          # lint + testes backend
cd frontend && npm run lint && npm test            # typecheck + testes frontend
```

## Regras do challenge

- Ambos da dupla precisam de commits visíveis.
- Nenhuma credencial commitada — segredos só em `.env` (ver `.env.example`).
- Registrar prompts relevantes em [PROMPTS.md](PROMPTS.md), inclusive os que falharam.
