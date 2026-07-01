# Meu Dia — Dashboard Enriquecido

## Contexto
Tela atual (`frontend/src/features/today/MyDayPage.tsx`) é básica: 4 stat cards, lista de foco, duas mini-listas e um card "Pulse Intelligence". Fica visualmente pobre e com padding lateral grande porque `AppShell.tsx` aplica `max-w-6xl mx-auto` em toda rota exceto `/app/boards`. Objetivo: transformar em dashboard rico, full-width, com gráfico e animações, sem quebrar dados/hooks existentes (`useWorkspaceCards`, `useAuthStore`).

## Layout
- `AppShell.tsx`: condição que hoje é `!location.pathname.startsWith("/app/boards")` passa a também excluir a rota index `/app` (Meu Dia) do `max-w-6xl`. MyDayPage assume controle total da largura e define seu próprio grid responsivo de widgets (estilo dashboard, não mais coluna única 1fr+320px forçada por container estreito).
- Grid geral: stat row (4 cols) → burndown chart (largo) + coluna lateral (Pulse + Resumo) → foco/listas abaixo, em grid responsivo (`lg:grid-cols-3` ou similar) para ocupar bem a largura em telas grandes.

## Componentes novos/alterados
1. **StatCard** (evolução do `Stat` atual): número com contador animado (count-up via framer-motion `useSpring`/`useMotionValue`), hover com `translateY` + shadow, ícone com leve glow de fundo.
2. **SprintBurndownCard** (novo): gráfico de área (recharts `AreaChart`) mostrando linha ideal vs. pontos restantes reais por dia da sprint. Sprint real ainda não tem histórico no backend — dado é derivado client-side a partir dos cards atuais (pontos totais da sprint distribuídos linearmente como "ideal", e "real" nivelado no ponto atual), com comentário no código deixando claro que é aproximação até existir endpoint de histórico. Entrada com fade/draw animado.
3. **SprintRow / Resumo da sprint**: mantém, números também com count-up.
4. **Seu foco agora / MiniPanel**: mantém estrutura e dados, ganha `stagger` de entrada via `framer-motion` (`motion.div` com `variants` e `staggerChildren`).
5. **PulseIntelligence**: mantém como está (já tem visual rico).

## Dependência nova
- `recharts` — adicionar ao `frontend/package.json`. `framer-motion` já está instalado (`^11.11.0`), reutilizado para todas as animações (sem lib nova de animação).

## Dados
Nenhuma mudança de API/hook. Tudo segue vindo de `useWorkspaceCards` + `useAuthStore`. O burndown é 100% derivado no frontend a partir de `mine`/`points` já calculados na página — não requer novo endpoint agora.

## Fora de escopo
- Endpoint real de histórico de burndown (fica para quando existir necessidade real de precisão histórica).
- Donut de status e heatmap de atividade (usuário optou por não incluir agora).
- Dark mode / tokens de cor: reutiliza tokens já existentes (`brand`, `paper`, `ink`, `danger`, `warning`), nenhum token novo necessário.

## Testagem
Verificação visual manual (rodar frontend, abrir `/app`, checar full-width, animações de entrada, hover nos stat cards, burndown renderizando com dados mock/derivados, responsividade em telas menores).
