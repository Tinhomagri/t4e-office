# PROMPTS.md — Registro de uso de IA

> **Obrigatório no Dev Challenge 2026.** Registro dos principais prompts, a ferramenta
> usada e o que foi **aproveitado** ou **descartado** de cada resposta — incluindo os que
> **não funcionaram**. Objetivo: mostrar IA como parceira de raciocínio, não atalho.

## Como preencher (não apague — é avaliado)

Cada entrada segue o padrão de um bom prompt: **Contexto · Tarefa · Formato · Restrições**.
Depois do resultado, registre **o que a IA gerou vs. o que foi alterado/validado por nós**.

Template:

```
### YYYY-MM-DD · [Título curto]
- **Ferramenta:** Claude Code / ChatGPT / Copilot / ...
- **Contexto:** o que a IA precisava saber
- **Tarefa:** o que pedimos
- **Formato/Restrições:** linguagem, camadas, convenções, o que NÃO fazer
- **Prompt:** (texto do prompt, resumido se longo)
- **Resultado:** o que veio
- **Aproveitado:** o que ficou
- **Descartado/Ajustado:** o que mudamos e por quê (raciocínio nosso)
```

---

## Decisões de processo sobre IA

- IA usada como **acelerador** de scaffolding, boilerplate e revisão — nunca para
  decisões de arquitetura sem validação humana.
- Todo código gerado é lido, entendido e ajustado antes do commit. A dupla consegue
  explicar cada trecho na apresentação ao vivo.
- Prompts evoluem: começamos amplos, depois refinamos com restrições concretas
  (camadas DDD, nomes de contexto, convenções de commit).

---

## Registro (ordem cronológica)

### 2026-06-25 · Fundação — scaffolding DDD por bounded context
- **Ferramenta:** Claude Code (Opus)
- **Contexto:** projeto greenfield Django, exigência de arquitetura DDD com ORM confinado
  à infraestrutura; contextos `identity` e `projects`.
- **Tarefa:** gerar a estrutura de 4 camadas (domain/application/infrastructure/interface)
  para o contexto `identity` com User custom (email+senha), Workspace, Membership, Invitation.
- **Formato/Restrições:** domínio Python puro sem import de Django; repositories como
  portas; JWT via SimpleJWT; sem lógica em views.
- **Aproveitado:** esqueleto das camadas, UserManager custom, portas de repositório.
- **Descartado/Ajustado:** primeira versão vazava ORM no domínio — refizemos separando
  entidades de domínio dos models Django (acoplamento por id entre contextos).

### 2026-07-01 · Dashboard "Meu Dia" (RF-05)
- **Ferramenta:** Claude Code
- **Contexto:** métricas por status/prazo/responsável; frontend React + TanStack Query.
- **Tarefa:** endpoint agregando burndown + cards do dia e componente de dashboard full-width.
- **Aproveitado:** agregação de métricas e layout.
- **Descartado/Ajustado:** cálculo de burndown inicial ignorava sprints fechadas — corrigido
  após revisão manual da regra.

### 2026-07-06 · Deliverables do challenge (README, PROMPTS, ADR, seed)
- **Ferramenta:** Claude Code (Opus 4.8)
- **Contexto:** repo já com RF-01..06 implementados; faltavam entregáveis obrigatórios.
- **Tarefa:** mapear cobertura dos RF, criar `seed_demo` idempotente, README completo,
  este PROMPTS.md e os ADRs.
- **Formato/Restrições:** seed usando get_or_create; não commitar credenciais; docs em PT-BR.
- **Aproveitado:** comando de seed (testado, idempotente) e estrutura dos docs.
- **Descartado/Ajustado:** seed inicial montava campos de card inexistentes — ajustado após
  ler os models reais (`CardModel`).

---

<!-- Adicione novas entradas ACIMA desta linha conforme o desenvolvimento avança.
     Inclua também os prompts que NÃO funcionaram — eles contam pontos. -->
