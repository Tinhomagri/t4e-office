# Escritório: PC do avatar com desktop Win98

**Data:** 2026-07-26
**Fatia:** 1 de 2 (fatia vertical fina)
**Repo:** `t4e-office`

## Problema

O Escritório virtual (mapa 2D com avatares) é uma aba isolada. Todas as outras
funcionalidades — Boards, Comercial, Relatórios, Marketing — vivem em rotas
separadas fora do mapa, navegadas pela sidebar do `AppShell`. O jogo e o produto
são dois mundos que não se tocam.

Queremos que sentar na própria mesa do escritório abra um computador dentro do
mapa: um desktop estilo Windows 98, com janelas, taskbar e menu Iniciar,
hospedando as mesmas funcionalidades que existem hoje. O PC passa a ser o
caminho principal de navegação; a sidebar do `AppShell` reduz a um mínimo.

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Enquadramento | Híbrido: zoom no monitor dentro do mapa, com opção de expandir uma janela pra viewport inteira |
| Entrada no Escritório | `/app/office` monta em tela cheia sempre (não só ao sentar) |
| Menus atuais | PC vira caminho principal; sidebar do `AppShell` reduz a Escritório + poucos essenciais (fatia 2) |
| Agrupamento de apps | Pastas por área (Trabalho, Comercial, Marketing, Sistema) |
| Estilo do conteúdo | Win98 completo via tema CSS escopado, sem tocar no JSX das páginas (conteúdo é fatia 2; fatia 1 faz o chrome) |
| Gatilho | Só a mesa pessoal do usuário. Fatia 1 deriva de `hash(user.id)`; fatia 2 troca por tabela no backend |
| Fatiamento | Fatia vertical fina primeiro: fluxo end-to-end usável com 2 apps reais |

### Fora de escopo desta fatia

- Backend `DeskAssignment` (model, API claim/release, UI de escolher mesa) — fatia 2.
- Tema Win98 no **conteúdo** das páginas (botões, inputs, tabelas, scrollbar) — fatia 2.
- Redução da sidebar do `AppShell` — fatia 2.
- Os outros 13 apps ligados de verdade — fatia 2.
- Alterações no mapa (layout, props, novas salas) — trabalho futuro separado.

## Estado atual do código

O mapa é uma engine canvas 2D própria, não um plugin de terceiros:

- `frontend/src/features/office/world/engine.ts` (825 linhas) — `OfficeEngine`:
  loop de passo fixo, câmera, colisão, partículas, luz, ordenação por profundidade.
- `frontend/src/features/office/world/map.ts` (342) — `buildOfficeMap()`: grid,
  props, zonas, assentos, luzes.
- `frontend/src/features/office/OfficeRoom.tsx` (405) — ponte React↔canvas; monta
  o `<canvas>`, dona do HUD/chat/emotes. Não re-renderiza por frame.
- `frontend/src/features/office/OfficePage.tsx` (97) — página de rota; hoje
  empilha `PageHeader` + `PresenceBar` + `OfficeRoom` + `StatusLegend`.

Fatos que sustentam o design:

1. **Sentar já existe.** `tryInteract()` (`engine.ts:288-317`) acha o assento livre
   mais próximo num raio de 26px, seta `me.seatIndex`, muda facing/animação e
   dispara `onInteract(seat.label)`. Ligado à tecla `E` (`engine.ts:271`) e a um
   botão do HUD (`OfficeRoom.tsx:220-225`). Hoje só mostra um toast — não navega
   pra lugar nenhum. Falta apenas ligar assento → tela.
2. **Assentos não têm identidade.** `map.ts:293-309` cria 14 assentos de trabalho
   (4 ilhas × 2 estações + 3 mesas individuais + 3 cabines) e mais sofá/copa/reunião,
   identificados só por índice de array e `label` string.
3. **Escala é inteira.** `resize()` (`engine.ts:565-580`) escolhe `scale` entre 2 e 4
   por `Math.floor`, e `updateCamera()` (`engine.ts:582-598`) arredonda a câmera —
   é isso que impede o mundo de tremer. Qualquer zoom precisa respeitar essa regra.
4. **Canvas é uma caixa 16:10.** `OfficeRoom.tsx:167` usa
   `aspect-[16/10] w-full` dentro do container padrão do `AppShell`. Espaço
   insuficiente pra embutir páginas reais — daí a decisão de tela cheia.
5. **Não existe window manager.** Nenhuma lib de drag/resize no `package.json`;
   `shared/ui/primitives.tsx:200` tem só um `Modal` centralizado não-arrastável.
   Sistema de janelas é do zero.
6. **Páginas são componentes autocontidos.** Todas as ~15 rotas
   (`app/router.tsx:71-108`) buscam seus próprios dados via hooks react-query e não
   dependem de contexto de rota além de `useParams`/`useSearchParams`. São
   embutíveis numa janela; só assumem largura de viewport cheia.

Stack: React + react-router-dom 6, zustand 5, @tanstack/react-query 5,
framer-motion 11, Tailwind 3, vitest.

## Arquitetura

### Fluxo e máquina de estados

```
off ──sentar na SUA mesa──> booting ──~700ms──> desktop
 ▲                                                │
 │                                    duplo-clique titlebar ou botão □
 │                                                ▼
 └──ESC / "Levantar" ◄───── ESC ────────────── expanded
```

- **`off`** — mapa normal. WASD anda, `E` senta. Sentar em assento que não é a mesa
  do usuário mantém o comportamento atual (animação + toast).
- **`booting`** — câmera dá zoom no monitor da mesa (`scale 3→6`, easing, travada no
  alvo); a tela do monitor mostra um boot 98 curto (POST + logo). Cancelável com ESC.
- **`desktop`** — painel emoldurado sobre o mapa zoomado, ocupando ~78% do canvas e
  centralizado: wallpaper, ícones/pastas, janelas, taskbar. O escritório continua
  visível e vivo em volta — outros avatares andam, a luz pisca.

  **Por que painel e não "dentro da telinha":** a tela do monitor no sprite tem
  10×7 pixels (`props.ts:59`). Mesmo a 6× de zoom são 60×42 CSS px — não cabe
  interface nenhuma. A imersão vem do enquadramento (câmera na sua mesa, escritório
  em volta), não de literalmente pintar dentro do sprite.

  **Nenhum `transform` CSS em nenhum dos dois modos.** O painel é DOM em tamanho
  real (sem `scale`), e a janela expandida é `fixed inset-0`. Isso importa: um
  `transform` num ancestral vira containing block e faria todo `position: fixed`
  das páginas embutidas — inclusive o `Modal` de `shared/ui/primitives.tsx:219` —
  se posicionar dentro do painel em vez da viewport. Sem transform, os modais das
  páginas se comportam exatamente como hoje. A animação de expandir anima
  `left/top/width/height`, não `scale`.
- **`expanded`** — uma janela sai do rect do monitor e anima até a viewport inteira
  (framer-motion `layout`). O resto do desktop permanece atrás. ESC volta ao monitor.

**Input é exclusivo.** Enquanto `pcState !== "off"`, a engine ignora WASD e `E` —
senão digitar num campo do Boards faz o avatar andar. A engine ganha
`setInputEnabled(boolean)`; `Win98Desktop` desliga ao montar e religa ao desmontar.

### Mudanças na engine

Cinco adições. Nenhuma reescrita do loop, da colisão ou do render.

| Assinatura | Propósito |
|---|---|
| `focusOn(x, y, scale)` / `clearFocus()` | Trava a câmera num ponto e troca a escala. A escala continua **inteira** (`engine.ts:569` é a regra que impede o mundo de tremer) e troca de uma vez, coberta pelo fade do boot; o deslocamento da câmera usa o easing que já existe. `imageSmoothingEnabled` continua `false`. |
| `setInputEnabled(enabled)` | Trava teclado do mapa enquanto o PC está aberto. |
| `onInteract(seat: Seat \| null)` | Hoje o callback recebe só `label: string`. Passa o `Seat` inteiro (com `id` e `kind`); `null` ao levantar. |

`Seat` em `map.ts` ganha dois campos:

- `id: string` — **estável, derivado do tile** (`"ws-26-9"`), não do índice do array.
  Índice quebra na primeira mudança de mapa; o usuário já sinalizou que quer alterar
  o mapa depois, e a fatia 2 vai persistir mesa por usuário no banco.
- `kind: "pc" | "meeting" | "lounge"` — marca os assentos que **têm** computador.
  Estação de trabalho, mesa individual e cabine de foco são `"pc"` (14 assentos);
  sala de reunião é `"meeting"`; sofá e copa são `"lounge"`.

`kind` e propriedade são coisas distintas: `kind: "pc"` diz que o assento tem
computador, e `desk.ts` diz qual desses 14 é a mesa **daquele** usuário. O desktop
abre só quando as duas condições valem. Sentar num assento `"pc"` que não é o seu
mantém o comportamento atual (animação de digitar + toast).

### Módulos novos

Dois módulos puros saem da engine para virar testáveis:

| Arquivo | Responsabilidade |
|---|---|
| `world/camera.ts` | `integerScale`, `viewportFor`, `worldToScreen`, `screenToWorld`, `cameraTarget`. A engine passa a delegar; comportamento idêntico. |
| `world/input.ts` | `keyAction(key, enabled)` → `"move" \| "interact" \| "ignore"`. Único lugar que decide se uma tecla vale. |

O resto vive em `frontend/src/features/office/pc/` — pasta isolada, nada espalhado.

| Arquivo | Responsabilidade | Depende de |
|---|---|---|
| `pc.store.ts` | zustand: `pcState`, `windows[]`, `focusedId`, `expandedId`, `openFolderId`. Ações `open/close/focus/minimize/expand/collapse/boot/shutdown`. Lógica pura de z-order e geometria de janela. | — |
| `apps.registry.ts` | `appId → { label, icon, group, component, defaultSize }`. Único lugar que conhece as páginas do produto. | páginas existentes |
| `Win98Desktop.tsx` | Wallpaper, grade de ícones, pastas por área; orquestra janelas + taskbar. | store, registry |
| `Win98Window.tsx` | Moldura bevel, titlebar, drag, resize, `_ □ X`, scroll interno do conteúdo. | store |
| `Taskbar.tsx` | Botão Iniciar, botões das janelas abertas, relógio, botão "Levantar". | store |
| `StartMenu.tsx` | Menu hierárquico: Programas > grupo > app. | registry |
| `BootScreen.tsx` | Animação do estado `booting`. | — |
| `win98.css` | Tokens e escopo `.win98`: bevel, MS Sans Serif, scrollbar. | — |
| `desk.ts` | Resolve a mesa do usuário: `myDeskId(userId, seats)` → `hash(userId) % ` (nº de assentos `kind: "pc"`, hoje 14), sobre a lista ordenada por `id` pra não depender da ordem de construção do mapa. Fatia 2 troca a implementação por chamada de API sem tocar em mais nada. | — |

`OfficeRoom.tsx` ganha só duas coisas: monta `<Win98Desktop/>` quando
`pcState !== "off"` e liga o callback de sentar. **Nenhuma página existente é
editada** — o registry importa e embute.

`OfficePage.tsx` passa a renderizar em tela cheia: `PageHeader`, `PresenceBar` e
`StatusLegend` viram overlay HUD sobre o canvas em vez de blocos empilhados acima
e abaixo dele.

### Grupos de ícones

Quatro pastas no desktop, abrindo em janela de pasta:

| Pasta | Apps |
|---|---|
| Trabalho | My Day, Boards, Poker |
| Comercial | Comercial, Relatórios, Portfólio |
| Marketing | Calendário, Fila, Analytics, Redes |
| Sistema | Integrações, Avatar, Membros, Copiloto |

**Nesta fatia só Boards e Comercial abrem de verdade.** Os outros 13 ícones aparecem
desabilitados, com tooltip "em breve" — desenho completo, escopo honesto. A fatia 2
apenas preenche o registry.

## Riscos e mitigação

1. **Páginas assumem viewport cheia.** A janela tem scroll próprio e `min-width`, e
   os tamanhos default são generosos (Boards abre em 900×600). O restyle do conteúdo
   é fatia 2; nesta fatia, "expandir" resolve qualquer aperto.
2. **Zoom em pixel-art.** A engine já exige escala inteira (`engine.ts:569`). A troca
   de escala é instantânea e acontece atrás do fade do boot; `imageSmoothingEnabled`
   permanece `false`.
2b. **Canvas não roda em jsdom.** `node_modules/canvas` não está instalado, então
   `getContext("2d")` devolve `null` nos testes e a `OfficeEngine` não pode ser
   instanciada. Por isso a matemática de câmera e o gate de teclado saem para
   módulos puros (`world/camera.ts`, `world/input.ts`) — testáveis de verdade — e a
   engine só delega. A integração final é verificada pelos critérios de aceitação
   manuais.
3. **Perf: React pesado sobre canvas de 60fps.** O overlay é DOM separado e não
   redesenha por frame. Durante o zoom (~700ms) só o `transform` do container é
   atualizado; depois o overlay fica estático.
4. **`prefers-reduced-motion`.** A engine já respeita (`reduceMotion`, `engine.ts:106`).
   Com a flag ligada, zoom e boot são instantâneos.
5. **Colisão de mesa derivada.** `hash(user.id) % 14` colide se o workspace tiver mais
   de 14 pessoas: duas pessoas "possuem" a mesma mesa. Aceitável nesta fatia (o
   workspace demo tem 3 usuários) e é exatamente o que a tabela do backend resolve na
   fatia 2. A UI não promete exclusividade nesta fatia.

## Testes

vitest já configurado (`frontend/src/features/office/office.util.test.ts`).

- **`desk.ts`** — a mesma pessoa resolve sempre pra mesma mesa; a distribuição cobre
  todas as estações sem buraco.
- **`pc.store.ts`** — abrir, fechar, focar, z-order, minimizar, expandir, colapsar.
  Lógica pura: cobertura alta e barata. É aqui que mora a maior parte da complexidade.
- **`map.ts`** — todo assento tem `id` único; `kind` correto por tipo de assento.
- **`world/camera.ts`** (extraído) — `integerScale` respeita o piso 2 e o teto 4;
  `viewportFor` deriva `viewW`/`viewH`; `screenToWorld` é inverso de `worldToScreen`;
  `cameraTarget` centraliza no ponto e trava nas bordas do mapa.
- **`world/input.ts`** (extraído) — `keyAction` devolve `"ignore"` para tudo quando
  desabilitado, `"move"` para WASD/setas/shift e `"interact"` para `e`.

## Critérios de aceitação

1. Abrir `/app/office` mostra o escritório em tela cheia, sem header nem blocos
   empilhados; informação de presença aparece como overlay.
2. Andar até a própria mesa e apertar `E` dá zoom na mesa, roda o boot e mostra o
   painel do desktop Win98 — wallpaper, 4 pastas, taskbar — com o escritório visível
   em volta.
3. Sentar em sofá, copa, sala de reunião — ou em qualquer estação que não seja a sua —
   **não** abre o PC; mantém o toast atual.
4. Abrir a pasta Trabalho e dar duplo-clique em Boards abre uma janela Win98 com o
   Boards funcionando de verdade: dados reais, criar e mover card, trocar de aba.
5. A janela arrasta pela titlebar, redimensiona pela borda, minimiza pra taskbar,
   restaura pela taskbar e fecha pelo `X`.
6. Duas janelas abertas (Boards + Comercial): clicar numa traz pra frente; a taskbar
   marca a focada.
7. Botão `□` (ou duplo-clique na titlebar) expande a janela pra viewport inteira; ESC
   volta pro monitor.
8. Digitar no campo de busca do Boards não move o avatar.
8b. Abrir um modal de dentro de uma janela (ex.: criar negócio no Comercial) mostra o
   modal centralizado na viewport, não recortado nem deslocado — nos dois modos,
   painel e expandido.
9. ESC no desktop, ou o botão "Levantar" da taskbar, faz zoom out e volta ao mapa
   normal com o avatar de pé.
10. `prefers-reduced-motion: reduce` elimina o zoom e o boot, sem quebrar o fluxo.
