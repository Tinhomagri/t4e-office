# Escritório — Andar 1 compacto e Andar 2 de Planning Poker

**Data:** 2026-07-28
**Contexto:** branch `feat/office-pc-win98` (segue a arquitetura de andares já implementada em `2026-07-26-office-andares-bullpen-design.md`)
**Status:** aprovado para planejamento

## Problema

O andar 1 atual (72×46 tiles) é grande demais: hall, recepção, varanda e fachada
de vidro consomem espaço que devia ir para estações de trabalho, e a câmera
(escala 3x típica) mostra poucos tiles por vez, dando sensação de mapa
gigantesco e câmera "colada" no personagem. Além disso metade das baias
(`cubicleFlip`) tem o assento virado para cima — de costas para a câmera —,
o que lê como bug visual.

O andar 2, hoje reservado no registry como "Reunião" sem planta, é o lugar
natural para uma demanda antiga: uma sala de Planning Poker dentro do mundo
pixel-art, com mesa em U, telão e "plaquinhas" de votação — em vez de mandar
o time para a `PokerPage` (sala 2D separada, tema escuro, mesa oval em
HTML/CSS) que já existe e funciona, mas vive fora da experiência 3D do
escritório.

## Objetivo

1. Reescrever a planta do andar 1: bullpen compacto, 1 corredor central,
   30 baias (15 de cada lado), todas com o mesmo assento voltado para baixo
   (nenhuma de costas para a câmera). Sem varanda, vidro ou hall grande nesta
   entrega.
2. Abrir a câmera (mostrar mais tiles por tela) ajustando a base de
   referência do cálculo de escala.
3. Construir o andar 2: sala de Planning Poker com mesa em U, 16 assentos,
   telão e console de host — reaproveitando 100% do backend e dos hooks de
   dados que já existem em `contexts/estimation` / `features/poker`, com uma
   camada de visualização nova em pixel-art (sem tocar a `PokerPage`, que
   continua existindo como está).

## Escopo

**Dentro:**
- `floors/floor1.ts` reescrito: planta compacta, 30 assentos `pc`.
- `camera.ts`: nova base de referência de escala.
- `floors/floor2.ts` novo: sala de poker.
- Props novos: `pokerTable` (mesa em U), `pokerScreen` (telão), `pokerConsole`.
- Ligação entre assento da mesa de poker e sessão ativa (join automático ao
  sentar, usando os hooks já existentes de `features/poker/poker.hooks.ts`).
- Visualização de voto como "plaquinha" acima da cabeça do avatar (verso até
  reveal, valor depois).
- Painel Win98 de controle do host, aberto pelo `pokerConsole`, reaproveitando
  os mesmos hooks de sessão/cards/apply-points que a `PokerPage` usa.
- Registry: andar 2 ganha `label: "Planning Poker"` e `build: buildFloor2`.

**Fora:**
- Qualquer mudança no backend de `estimation` (models, views, regras) — já
  está pronto e não muda.
- Mudanças na `PokerPage.tsx` (rota 2D separada) — continua existindo como
  está, sem integração com o mundo 3D além de compartilhar os mesmos dados.
- Customização visual da baia pelo usuário (cor/enfeite) — fica para um
  ciclo futuro.
- Varanda, fachada de vidro, deck — saem do andar 1 nesta entrega; podem
  voltar em ciclo futuro se fizerem sentido no novo layout.
- Andares 3 e 4 — seguem "em obras" no painel do elevador.

## Arquitetura

### Andar 1 — planta compacta

Dimensão alvo: **68×16 tiles** (contra 72×46 hoje).

```
      hall/elevador          corredor central (2 tiles)
  ┌────────┐  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐
  │ELEV    │  │ B │ B │ B │ B │ B │ B │ B │ B │ B │ B │ B │ B │ B │ B │ B │  ← 15 baias, frente p/ baixo
  └────────┘  ├───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┤
              │░░░░░░░░░░░░░░░░░ corredor ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
              ├───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┤
              │ B │ B │ B │ B │ B │ B │ B │ B │ B │ B │ B │ B │ B │ B │ B │  ← 15 baias, frente p/ baixo
              └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘
```

- Uma única baia-tipo: o prop `cubicle` existente (abertura sul), repetido nas
  duas fileiras. `cubicleFlip` sai de uso no andar 1 (o tipo continua
  existindo em `props.ts` — não precisa ser removido do código, só não é mais
  chamado por `floor1.ts`).
- Assento de cada baia sempre `facing: "down"`. A fileira de baixo abre para a
  parede sul (de costas para o corredor, de frente para a parede) — trade-off
  aceito: nenhum avatar mostra as costas para a câmera, custo é a fileira de
  baixo não ficar de frente para quem caminha no corredor.
- Hall do elevador mínimo na entrada oeste: só a cabine (4×4, zona
  `elevator`) e um pequeno espaço de chegada — sem sala de recepção.
- Sem varanda, vidro ou deck nesta entrega.
- Props de serviço (copiadora, arquivo, bebedouro, plantas) encostados nas
  pontas do corredor central, fora da faixa de circulação.
- Zonas: `elevator`, `bullpen` (cobre as duas fileiras + corredor).
- `map.ts`, `elevator.ts`, `world.store.ts`, presença por andar — nada muda
  (arquitetura já existe da spec anterior).

### Câmera mais aberta

`camera.ts::integerScale` usa hoje `Math.min(cssW / 320, cssH / 200)` como
base de referência — em telas comuns isso resulta em escala 3x, mostrando
~25 tiles de largura por vez. Nova base: `480×300`. Em uma tela de
1200×800px isso dá escala 2x (`min(1200/480, 800/300) = min(2.5, 2.66) → 2`),
mostrando ~40 tiles de largura por vez — praticamente o dobro de área visível
sem a escala virar fracionária (continua `Math.floor`, sempre inteira).

`focusScale`, `FOCUS_MAX`, `viewOffsetFor`, `offsetCamera` não mudam — só a
base de `integerScale`.

### Andar 2 — sala de Planning Poker

Dimensão alvo: **28×20 tiles**, uma sala única.

```
  ┌─────────────────────────────────────┐
  │              TELÃO                  │  ← prop na parede norte
  │        ┌─────────────────┐          │
  │  [C]   │                 │   [C]    │  ← cadeiras nas pontas do U
  │  [C]   │   mesa em U      │   [C]    │
  │  [C]   │  (aberta ao sul) │   [C]    │
  │        └─────────────────┘          │
  │  [C][C][C][C][C][C][C][C]           │  ← base do U, de frente pro telão
  │                                      │
  │      [console]     ELEV             │
  └─────────────────────────────────────┘
```

- **`pokerTable`** (prop novo): mesa em U, sólida, aberta ao sul.
- **16 assentos** ao redor da mesa — todos com `facing` voltado para dentro
  do U / para o telão (nenhum de costas para a câmera, mesma regra do
  andar 1).
- **`pokerScreen`** (prop novo, parede norte): estados de desenho —
  1. sem sessão ativa: "Aguardando sessão".
  2. sessão em votação: ref/título do card atual (via `usePokerCards`).
  3. revelado: valor final por participante + média (via dados já
     retornados pela sessão/rounds).
- **`pokerConsole`** (prop novo, perto do elevador): zona interativa; E abre
  um painel Win98 (reaproveitando `win98.css`, mesmo padrão do computador do
  andar 1) com os controles de host: escolher projeto/sessão
  (`useProjectSessions`, `useCreateProjectSession`), fila de cards
  (`usePokerCards`), iniciar/revelar (`useUpdateSession`), aplicar pontos
  (`useApplyPoints`). Painel só de leitura/ação para quem é host da sessão —
  mesma regra de permissão que a `PokerPage` já aplica.

### Assento de poker ↔ sessão

Novo hook `usePokerSeat(sessionId, seatId)` (nome provisório, camada
`features/office`), thin wrapper sobre `useJoinSession` +
`useSubmitVote` + `useHeartbeat` já existentes em `poker.hooks.ts`:

- Sentar em um assento `kind: "poker"`: se há sessão ativa no projeto
  vinculado ao andar (a definir na implementação: sessão fixa por workspace,
  ou selecionada no console), chama `useJoinSession` — mesma chamada que a
  `PokerPage` faz ao entrar. Sem sessão ativa: HUD mostra "aguardando sessão
  — abra pelo console".
- Votar: interação (tecla) abre um mini-seletor de carta (valores de
  `FIBONACCI`, já exportado de `poker.types.ts`); ao escolher, chama
  `useSubmitVote` e marca localmente "votei, verso visível".
- **Plaquinha acima da cabeça**: reaproveita o ponto do `engine.ts` onde hoje
  se desenha nome/status/balão acima do avatar (`ctx.fillStyle =
  STATUS_COLOR[...]`, região "Nomes, status e balões"). Acrescenta um badge
  pequeno: verso (ex.: "🂠" ou retângulo sólido) enquanto
  `session.status !== "revealed"`; valor do voto quando revelado. Estado vem
  direto do polling de 2s da sessão (`useSession`), sem novo estado de
  simulação no `engine.ts`.
- **Reveal**: reflexo do campo de status da sessão (`revealed`) já existente
  no backend — nada novo de regra, só de desenho.

### Registry

```ts
export const FLOORS: FloorDef[] = [
  { n: 1, label: "Bullpen", build: buildFloor1 },
  { n: 2, label: "Planning Poker", build: buildFloor2 },
  { n: 3, label: "Copa e lounge" },
  { n: 4, label: "Foco" },
]
```

## Impacto no que já existe

| O que muda | Por quê |
|---|---|
| `floors/floor1.ts` reescrito | planta nova, menor, sem varanda/vidro |
| Ids de assento do andar 1 mudam de novo | planta nova; mesa pessoal de cada um é reatribuída na primeira entrada (mesmo risco já aceito na spec anterior) |
| `cubicleFlip` fica sem uso no andar 1 | continua em `props.ts` para não quebrar import; pode ser removido depois se nenhum andar futuro usar |
| `camera.ts::integerScale` | base de referência maior — mais tiles visíveis, escala menor em telas comuns |
| `FLOORS[1]` (andar 2) | ganha `build` e muda label de "Reunião" para "Planning Poker" |
| `SeatKind` ganha `"poker"` | novo tipo de assento, ao lado de `"pc"` e `"view"`; só `"pc"` abre o desktop — regra existente não muda |
| `props.ts` ganha `pokerTable`, `pokerScreen`, `pokerConsole` | props novos do andar 2 |
| `engine.ts` ganha desenho de plaquinha acima da cabeça | extensão do ponto onde já desenha nome/status |

## Testes

- **`floor1.test.ts`** (reescrito): 30 assentos `kind: "pc"`, todos
  `facing: "down"`; BFS do spawn alcança todo assento e todo tile de
  corredor; nenhuma baia com abertura bloqueada por outro prop.
- **`floor2.test.ts`** (novo): 16 assentos ao redor da mesa, nenhum
  `facing` de costas para o telão; BFS do spawn alcança todo assento e o
  console; mesa/telão são sólidos; corredor de acesso ao console e à mesa
  livre.
- **`camera.test.ts`** (existente): nova base de `integerScale` não quebra
  o clamp de bordas em nenhuma resolução testada hoje; escala nunca
  fracionária.
- **Poker/mundo** (novo, lógica pura sem canvas): mapeamento assento↔sessão
  (sentar = tentativa de join; sem sessão ativa = estado "aguardando");
  estado de plaquinha (verso até `revealed`, valor depois) como função pura
  testável.
- Suítes de `poker.hooks.ts` / backend `estimation` não mudam — nada ali é
  alterado por este spec.

## Riscos

| Risco | Mitigação |
|---|---|
| 16 assentos ao redor da mesa em U ficarem sobrepostos/apertados | dimensionar mesa e margens de assento antes, testado em `floor2.test.ts` (sem overlap de retângulos de colisão) |
| Voto (polling 2s) parecer mais lento que o resto do mundo (presença, 1s) | comportamento igual ao que a `PokerPage` já tem hoje — não é regressão, é o mesmo mecanismo |
| Reescrever `floor1.ts` do zero derruba mesa pessoal de todo mundo outra vez | aviso no HUD na primeira entrada pós-deploy; ids continuam derivados do tile, estáveis a partir daí |
| Câmera mais aberta revelar borda do mapa em telas muito largas | `cameraTarget` já clampa nas bordas; validar em tela grande antes de fechar |
| Ambiguidade de "sessão do andar" (qual sessão/projeto abre por padrão ao entrar no andar 2) | decisão fica para a implementação: mais simples é console sempre mostrar sessões do workspace atual e host escolher qual abrir; não há sessão implícita "do andar" |

## Abertos para a implementação

- Nome exato do hook/arquivo que liga assento↔sessão (`usePokerSeat` é
  provisório).
- Estilo exato do badge de plaquinha (ícone vs. retângulo colorido) — decidir
  olhando o resultado no motor, não é uma decisão de arquitetura.
