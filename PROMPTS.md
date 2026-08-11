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

### 2026-07-29 · Presença no escritório — balão do card ativo ao passar o mouse
- **Ferramenta:** Claude Code (Opus)
- **Contexto:** escritório isométrico com avatares sentados; queríamos ver no que o colega
  está trabalhando sem sair da tela.
- **Tarefa:** endpoints `active-card` (GET/PATCH note), hit-test de hover em avatar sentado
  e balão com o card.
- **Formato/Restrições:** projeção isométrica 2:1 já existente (`worldToIso`), sem lib nova.
- **Aproveitado:** endpoints, hook de client e o balão.
- **Não funcionou:** o hit-test proposto casava o hover por `seatIndex`. Em produção nunca
  aparecia para colega remoto — só o *nosso* cliente escreve `seatIndex`; quem chega pelo
  canal de presença vem só com posição. Reescrito para casar por posição do assento
  (`hoverSeatAt`, commit `2f55c17`). Só apareceu porque testamos com duas contas reais;
  a IA não tinha como saber disso lendo o código.
- **Também ajustado:** `get_active_card` vazava card entre workspaces — faltava filtrar por
  workspace (`cf71494`). Achado em revisão manual, não pela IA.

### 2026-07-30 · Board e shell nas medidas reais do Jira
- **Ferramenta:** Claude Code (Opus) + screenshots do Jira como referência
- **Contexto:** nosso board "parecia" Jira mas nada batia — altura de card, gutter, coluna.
- **Tarefa:** medir na referência e ajustar tokens/medidas do board e do shell.
- **Formato/Restrições:** Atlassian Design System; alterar tokens, não hardcode por
  componente.
- **Aproveitado:** tabela de medidas e a passagem para tokens.
- **Lição:** pedir "parecido com o Jira" gera resultado genérico. Só rendeu quando o prompt
  trouxe a captura e os números — contexto concreto vale mais que adjetivo.

### 2026-07-31 · Redesign da tela de login
- **Ferramenta:** Claude Code (Opus)
- **Contexto:** login tinha um robô 3D (Spline) sem nenhuma relação com o produto.
- **Tarefa:** trocar por algo que mostre o próprio sistema.
- **Formato/Restrições:** React + framer-motion já no projeto; 60fps; respeitar
  `prefers-reduced-motion`.
- **Aproveitado:** carrossel de 4 slides (sprint/reuniões/copiloto/escritório) desenhados em
  SVG — `AuthCarousel.tsx`.
- **Não funcionou (3 tentativas descartadas):**
  1. Board 3D montando no scroll (R3F). O frustum foi calculado assumindo o painel quase
     quadrado (aspect ~0,97); o painel real é 760×1101 (**0,69**) e o board saía cortado dos
     lados. Errei a mesma conta duas vezes antes de medir o elemento de verdade.
  2. A montagem nunca completava: as janelas de animação dos cards eram
     `[delay, 0.36 + delay]`, então o último card ainda estava viajando quando o scroll
     acabava. Corrigido fazendo todas terminarem em `0.36`.
  3. `AnimatePresence` em modo `sync` renderizava dois títulos legíveis sobrepostos durante a
     troca de slide. `mode="wait"` resolveu.
- **Registro consciente:** o diagnóstico dos três veio de olhar a tela, não do modelo — a IA
  entregou código plausível que *parecia* certo em revisão de código e estava errado na tela.

### 2026-07-31 · "Meu Dia" agregando todos os workspaces
- **Ferramenta:** Claude Code (Opus)
- **Contexto:** o Meu Dia montava a tela a partir do workspace ativo. Quem participa de
  Boards + Marketing + Comercial só via a fatia do seletor no topo.
- **Tarefa:** endpoint pessoal agregando cards e sprints de todos os workspaces.
- **Formato/Restrições:** DDD — view fina, sem lógica; reusar a serialização de card já
  existente para não divergir de campo.
- **Aproveitado:** `GET /api/me/work/` (`me_views.py`) e o hook `useMyWork`.
- **Ajustado:** a primeira versão remontava o dict do card à mão na view e já saía sem
  `resolution` — exatamente o bug que a rota de JQL tinha tido antes. Extraímos `card_row()`
  em `card_views.py` para as três rotas usarem o mesmo formato.
- **Custo evitado:** montar isso no cliente seria `1 + W + 2·(W·P)` requisições. São 2 queries.

### 2026-07-31 · Nomes do Google Chat aparecendo como "Alguém"
- **Ferramenta:** Claude Code (Opus) + doc oficial da People API
- **Contexto:** toda mensagem e DM caía no fallback "Alguém".
- **Tarefa:** descobrir a causa e resolver os nomes.
- **Aproveitado:** causa raiz confirmada em produção **e** na doc — com auth de usuário
  (não bot), o recurso `User` do Chat devolve só `name` e `type`, nunca `displayName`.
  Solução: resolver `users/{id}` pela People API (`people.getBatchGet`).
- **NÃO funcionou — erro da IA, vale registrar:** eu (Claude) afirmei que o escopo era
  `https://www.googleapis.com/auth/people.readonly`. **Esse escopo não existe.** O Console do
  Google rejeitou como inválido e o consentimento quebrou com
  `Erro 400: invalid_scope ... invalid=[.../auth/people.readonly]`. Só depois de abrir a doc
  da People API confirmamos que o escopo correto para resolver colega do mesmo Workspace é
  `directory.readonly` (commit `85ce20d`).
- **Lição registrada no código:** o comentário em `oauth_provider_impl.py` diz explicitamente
  que `people.readonly` não é escopo real — para ninguém "corrigir" de volta.
- **Custo real:** ~40 min e um fluxo de OAuth quebrado em produção. Modelo alucina nome de
  API com a mesma confiança com que acerta; escopo/endpoint sempre confere na doc.

### 2026-07-31 · Lista de espaços do Chat travando, depois 500
- **Ferramenta:** Claude Code (Opus)
- **Contexto:** `/api/google/chat/spaces/` demorava demais e às vezes ficava pendurado.
- **Tarefa:** achar a causa e acelerar.
- **Aproveitado (3 causas reais):** `_members_of` rodava para *todo* espaço quando só DM
  precisa (grupo já tem `displayName`) — 2 chamadas externas por linha à toa; as restantes
  iam em série; e o `httplib2` padrão do `googleapiclient` **não tem timeout**, então uma
  chamada sem resposta pendura para sempre, sem erro e sem log.
- **NÃO funcionou:** a paralelização com `ThreadPoolExecutor` compartilhou um único
  `service` entre as threads. `httplib2.Http` guarda a conexão como estado interno e não é
  thread-safe — a rota passou a responder **500** em produção. Correção: `execute(http=...)`
  com um http por chamada (jeito documentado), `build()` uma vez só fora do pool porque
  baixa o discovery document pela rede.
- **Consequência aplicada:** a view passou a logar traceback de qualquer exceção que não seja
  `ChatError` e a devolver 502 com corpo. O 500 mudo, sem log, foi o que fez o diagnóstico
  custar uma ida e volta inteira.

---

<!-- Adicione novas entradas ACIMA desta linha conforme o desenvolvimento avança.
     Inclua também os prompts que NÃO funcionaram — eles contam pontos. -->
