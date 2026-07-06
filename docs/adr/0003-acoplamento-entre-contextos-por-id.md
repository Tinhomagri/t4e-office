# ADR 0003 — Acoplamento entre contextos por id

**Status:** Aceito · 2026-06-27

## Contexto

`projects` referencia `Workspace` e `User` de `identity`. Importar entidades de domínio
de outro contexto acoplaria os domínios e quebraria o isolamento dos bounded contexts.

## Decisão

Contextos se referenciam **por id**, não por import de domínio. Na camada de
infraestrutura usamos FK por string (`"identity.WorkspaceModel"`, `"identity.UserModel"`),
mantendo integridade referencial no banco; o domínio de `projects` conhece apenas o
`workspace_id`/`user_id`, nunca a classe do outro contexto.

```python
class ProjectModel(models.Model):
    workspace = models.ForeignKey("identity.WorkspaceModel", on_delete=models.CASCADE, ...)
```

## Consequências

- (+) Contextos permanecem desacoplados no domínio; poderiam virar serviços separados.
- (+) Banco garante integridade (FK real).
- (−) Sem navegação rica de objeto entre domínios; buscas cross-context passam por
  repositórios/ids. Aceitável para o escopo.
