# Pulse — Inventário Completo de Funcionalidades

> Catálogo exaustivo de TODAS as funcionalidades do documento de visão, mapeadas
> para bounded context, status atual e fase de entrega. Fonte: `Pulse_Visao_Produto.docx`
> (lido na íntegra, incluindo tabelas). Complementa o doc de arquitetura.
>
> Legenda de status: ✅ feito · 🟡 parcial · ⬜ não iniciado
> Data: 2026-06-27

---

## Resumo executivo

| Contexto | Funcionalidades | Feitas | Parciais | Faltam |
|---|---|---|---|---|
| identity | 9 | 6 | 1 | 2 |
| projects | 38 | 9 | 3 | 26 |
| estimation (Poker) | 11 | 0 | 0 | 11 |
| presence (Escritório) | 17 | 0 | 0 | 17 |
| reporting | 9 | 2 | 1 | 6 |
| automation | 2 | 0 | 0 | 2 |
| copilot (IA) | 6 | 2 | 1 | 3 |
| engajamento | 7 | 0 | 0 | 7 |
| **Total** | **99** | **19** | **6** | **74** |

O sistema hoje cobre ~19% do escopo do doc. O que existe é a espinha (auth, projeto, card básico, sprint, copiloto doc→card, telas derivadas). O grosso da visão — Poker, Escritório, Relatórios automáticos, Automação, Engajamento e os campos ricos do card — ainda falta.

---

## 1. IDENTITY — usuários, organização, acesso

| # | Funcionalidade | Status | Notas |
|---|---|---|---|
| 1.1 | Cadastro + login JWT | ✅ | SimpleJWT, email login |
| 1.2 | Verificação de email | ✅ | token |
| 1.3 | Reset de senha | ✅ | anti-enumeração |
| 1.4 | Workspace (organização) | ✅ | criar/listar |
| 1.5 | Membros + papéis (owner/admin/member) | ✅ | RBAC no use case |
| 1.6 | Convites por email + aceite | ✅ | token opaco; aceite valida email |
| 1.7 | **Espaço** (nível entre Workspace e Projeto) | ⬜ | doc §2: agrupa por área/cliente, permissões macro |
| 1.8 | SSO | ⬜ | doc §2: "SSO vive no Workspace" |
| 1.9 | Cobrança/billing | ⬜ | doc §2 |

## 2. PROJECTS — execução (boards, sprints, cards)

### Hierarquia (doc §2 — 6 níveis)
| # | Funcionalidade | Status | Notas |
|---|---|---|---|
| 2.1 | Projeto (board próprio) | ✅ | |
| 2.2 | Sprint | ✅ | planned/active/closed, 1 ativa/projeto |
| 2.3 | Backlog | 🟡 | cards sem sprint = backlog (escopo no board) |
| 2.4 | **Épico** (agrupa cards) | ⬜ | nível 4 do doc |
| 2.5 | Card | ✅ | unidade de trabalho |
| 2.6 | **Subtarefa / card filho** | ⬜ | parent_id recursivo |
| 2.7 | **Roadmap** | ⬜ | doc §1.1 pilar Execução |

### Anatomia do card (doc §2.1)
| # | Campo / recurso | Status | Notas |
|---|---|---|---|
| 2.8 | Título + ID curto (MIA-142) | ✅ | ref = KEY-number |
| 2.9 | Tipo (bug/feature/spike/débito/chore) | ✅ | |
| 2.10 | Prioridade | ✅ | low/medium/high/urgent |
| 2.11 | Responsável | ✅ | |
| 2.12 | **Revisores** | ⬜ | lista de users |
| 2.13 | **Observadores** | ⬜ | watchers |
| 2.14 | **"Quem está olhando agora"** (realtime) | ⬜ | diferencial; precisa WS |
| 2.15 | Story Points | ✅ | |
| 2.16 | **Estimativa em horas** | ⬜ | campo separado |
| 2.17 | **Confiança (%)** | ⬜ | vem do "poker de risco" |
| 2.18 | **Data de início / prazo** | ⬜ | model tem só created_at |
| 2.19 | **Lead time / cycle time (auto)** | ⬜ | derivado de transições |
| 2.20 | **Relações** (bloqueia/bloqueado/duplica/relacionado/filho) | ⬜ | CardRelation |
| 2.21 | Descrição rica | ✅ | Tiptap |
| 2.22 | **Checklists** | ⬜ | Checklist + items |
| 2.23 | **Anexos** | ⬜ | upload + storage |
| 2.24 | **Comentários com menções + threads** | ⬜ | dispara notificação |
| 2.25 | **Campos personalizados** (dropdown/número/rating/progresso/relação) | ⬜ | CustomField |
| 2.26 | **Campo Fórmula** (estilo planilha: SP×(1+Risco/10)) | ⬜ | diferencial do doc |

### Views do trabalho (doc §3 — 6 visualizações)
| # | View | Status | Recurso de destaque |
|---|---|---|---|
| 2.27 | Kanban | ✅ | drag-drop; **falta WIP limit + alerta gargalo** |
| 2.28 | **WIP limit por coluna + alerta** | ⬜ | doc §3 |
| 2.29 | **Sprint Board com burndown ao vivo** | 🟡 | sprint existe; falta burndown |
| 2.30 | **Lista (edição inline tipo planilha, Tab pula célula)** | ⬜ | |
| 2.31 | **Timeline / Gantt** (arrastar p/ reagendar, cadeia crítica) | ⬜ | |
| 2.32 | **Calendário** (capacidade/dia, carga vs limite) | ⬜ | |
| 2.33 | **Dashboard** (widgets arrastáveis velocity/risco/burn-up) | ⬜ | |

### Filtros e Meu Dia (doc §3.1)
| # | Funcionalidade | Status | Notas |
|---|---|---|---|
| 2.34 | **Filtros combináveis** | ⬜ | |
| 2.35 | **Visões salvas e compartilháveis** | ⬜ | SavedView |
| 2.36 | Meu Dia — "vence hoje" | 🟡 | falta prazo no card; hoje usa status |
| 2.37 | Meu Dia — "bloqueado esperando você" | ⬜ | precisa relações |
| 2.38 | Meu Dia — "menções não lidas" | ⬜ | precisa comentários |
| 2.39 | Meu Dia — "cards onde você é o gargalo" | ⬜ | precisa aging/relações |
| 2.40 | Meu Dia — cards atribuídos + progresso | ✅ | ligado a dados reais |
| 2.41 | **Intake form** (formulário de entrada que tria → card) | ⬜ | lacuna mercado §10.2 |
| 2.42 | **Versionamento de anexos** (qual versão? + preview) | ⬜ | lacuna mercado §10.2 |
| 2.43 | **Replanejamento automático** (reordena quando atrasa) | ⬜ | lacuna mercado §10.2 |

## 3. ESTIMATION — Planning Poker (doc §4)

| # | Funcionalidade | Status | Notas |
|---|---|---|---|
| 3.1 | Sessão (facilitador puxa cards do backlog) | ⬜ | |
| 3.2 | Apresentação do card (título/descrição/critérios + timer) | ⬜ | |
| 3.3 | Voto secreto simultâneo (cartas viradas) | ⬜ | precisa WS |
| 3.4 | Revelação com lock no servidor | ⬜ | Redis lock (race condition) |
| 3.5 | Estatísticas (média/mediana/mín/máx) | ⬜ | |
| 3.6 | Convergência + destaque de outliers + re-votação | ⬜ | |
| 3.7 | Registro do ponto no card + histórico de votos | ⬜ | |
| 3.8 | **Baralhos** (Fibonacci/T-Shirt/Sequência/Horas/Personalizado) | ⬜ | 5 decks |
| 3.9 | **Âncora histórica** (cards parecidos já entregues) | ⬜ | diferencial |
| 3.10 | **Modo assíncrono** (janela 24h) | ⬜ | |
| 3.11 | **Poker de risco** (gera campo confiança) | ⬜ | alimenta previsões |

## 4. PRESENCE — Escritório Virtual (doc §5)

| # | Funcionalidade | Status | Notas |
|---|---|---|---|
| 4.1 | Mapa 2D navegável | ⬜ | Canvas/WebGL |
| 4.2 | Avatar + status auto/manual | ⬜ | avatar lab existe (visual só) |
| 4.3 | Salas com propósito (mesa/reunião/foco/social/arena) | ⬜ | |
| 4.4 | Proximidade = canal de voz/vídeo | ⬜ | WebRTC+SFU |
| 4.5 | Áudio espacial | ⬜ | |
| 4.6 | Salas de foco (silencia notificações) | ⬜ | |
| 4.7 | Heartbeat + reconciliação de presença | ⬜ | Redis |
| 4.8 | Ponte: hover avatar → trabalho atual + prazos | ⬜ | |
| 4.9 | Ponte: clicar mesa → abre board da equipe | ⬜ | |
| 4.10 | Ponte: arena → inicia/junta sessão de Poker | ⬜ | |
| 4.11 | Ponte: sala de reunião → quadro vira ata automática | ⬜ | |
| 4.12 | Ponte: mural da copa (feed social/kudos) | ⬜ | |
| 4.13 | Ponte: "bater na mesa" (cutucada leve) | ⬜ | |
| 4.14 | **Horário de visita** (janelas de interrupção) | ⬜ | |
| 4.15 | **Mapa de calor de atividade** (gestor) | ⬜ | |
| 4.16 | **Rituais como objetos** (daily às 9h pisca) | ⬜ | |
| 4.17 | **Avatares de IA** (assistente sprint/bibliotecário) | ⬜ | |

## 5. REPORTING — relatórios e métricas (doc §11)

| # | Funcionalidade | Status | Notas |
|---|---|---|---|
| 5.1 | **Status que se escreve sozinho** (narrativo, sexta/sob demanda) | ⬜ | IA sobre cards |
| 5.2 | Métrica: throughput | 🟡 | hoje só contagem; falta por período |
| 5.3 | Métrica: cycle time | ⬜ | precisa timestamps de transição |
| 5.4 | Métrica: lead time | ⬜ | idem |
| 5.5 | Métrica: aging (card parado) | ⬜ | idem |
| 5.6 | Métrica: gargalo atual | 🟡 | portfólio detecta "review"; falta tempo |
| 5.7 | Visão de portfólio (saúde/alocação/risco) | ✅ | calculado de cards reais |
| 5.8 | **Pergunte aos dados** (NL → gráfico) | ⬜ | IA |
| 5.9 | **Dashboard que se monta sozinho** | ⬜ | inferido do perfil do projeto |
| 5.10 | Distribuições (status/tipo/prioridade) | ✅ | extra útil já entregue |

## 6. AUTOMATION — motor sem código (doc §6.3)

| # | Funcionalidade | Status | Notas |
|---|---|---|---|
| 6.1 | Regras Gatilho → Condição → Ação | ⬜ | consome event bus |
| 6.2 | 5 receitas de fábrica (revisor QA, risco em 24h, PR mergeado, sprint encerrado, menção offline) | ⬜ | |

## 7. COPILOT — IA conversacional (doc §6.2)

| # | Funcionalidade | Status | Notas |
|---|---|---|---|
| 7.1 | Documento/transcrição → análise → cards | ✅ | já entregue |
| 7.2 | Extração de PDF/DOCX/áudio | 🟡 | pdf/docx ok; áudio opcional |
| 7.3 | "Resuma o que mudou no projeto X" | ⬜ | precisa histórico |
| 7.4 | "Crie cards do épico Y e quebre em subtarefas" | 🟡 | cria cards; falta épico/subtarefa |
| 7.5 | "Quais cards estão me bloqueando" | ⬜ | precisa relações |
| 7.6 | "Gere notas de retro dos comentários" | ⬜ | precisa comentários |

## 8. INTELIGÊNCIA PREDITIVA (doc §6.1)

| # | Funcionalidade | Status | Notas |
|---|---|---|---|
| 8.1 | Previsão de entrega (velocity + poker, % confiança) | ⬜ | |
| 8.2 | Detector de risco (parado/bloqueado/estouro) | ⬜ | |
| 8.3 | Balanceamento de carga (sobrecarga + sugestão) | ⬜ | capacidade real |
| 8.4 | Sugestão de responsável (histórico/domínio) | ⬜ | |
| 8.5 | **Capacidade real** (Poker × horas, férias, meio período) | ⬜ | lacuna mercado §10.2 |

## 9. ENGAJAMENTO — coisas interativas (doc §7)

| # | Funcionalidade | Status | Notas |
|---|---|---|---|
| 9.1 | Confete de conclusão | ⬜ | microanimação |
| 9.2 | Velocity em chamas | ⬜ | |
| 9.3 | Kudos & reconhecimento (mural da copa) | ⬜ | |
| 9.4 | Modo foco Pomodoro (timer no card + sala foco) | ⬜ | |
| 9.5 | Retrospectiva interativa (manter/parar/começar + votos) | ⬜ | |
| 9.6 | Health check do time (pesquisa anônima semanal) | ⬜ | |
| 9.7 | Conquistas coletivas (marcos de equipe, nunca ranking) | ⬜ | gamificação responsável |

## 10. NOTIFICATIONS (transversal)

| # | Funcionalidade | Status | Notas |
|---|---|---|---|
| 10.1 | Notificações in-app (menção/atribuição/risco/poker) | ⬜ | |
| 10.2 | Preferências por tipo (in-app/email) | ⬜ | |
| 10.3 | Entrega WS ao vivo | ⬜ | |

---

## Releitura do roadmap (alinhado ao doc §9)

O doc define 4 fases. Mantenho a decomposição em contextos, mas re-priorizo
**Relatórios** cedo (é a lacuna nº 1 do mercado, §10) e respeito a ordem do doc
(núcleo → inteligência → presença → copiloto):

- **F1 — Núcleo de execução** (em andamento): card rico completo (revisores, prazo,
  relações, checklists, comentários, anexos, campos custom/fórmula), views Lista +
  WIP, filtros + visões salvas, Épico/Subtarefa. *Marco: um time migra projeto real.*
- **F2 — Inteligência**: Poker completo (5 baralhos, âncora histórica, lock, risco) +
  Automação + Dashboards + métricas de fluxo reais (cycle/lead/aging) + status
  automático narrativo.
- **F3 — Presença**: Escritório 2D, avatares, salas, áudio espacial, ponte com gestão.
- **F4 — Copiloto+**: assistente conversacional workspace-aware, previsões, detector
  de risco, balanceamento, capacidade real, pergunte-aos-dados.
- **Transversais contínuos**: Notifications, Engajamento (confete→kudos→retro→health).

---

## Próximo passo recomendado

Fechar o **card rico** (itens 2.12–2.26) é o maior desbloqueador: ele alimenta Meu
Dia real (prazo, bloqueios, menções), Relatórios (cycle/lead/aging via timestamps),
Poker (confiança) e Automação (gatilhos). Sugiro a próxima fatia ser
**"Card rico + métricas de transição"** antes de partir para Poker/Escritório.
