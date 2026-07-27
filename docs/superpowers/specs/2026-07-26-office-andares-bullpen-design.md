# Escritório em andares — Andar 1: bullpen, vidro e varanda

**Data:** 2026-07-26
**Contexto:** branch `feat/office-pc-win98`
**Status:** aprovado para planejamento

## Problema

O escritório atual é um andar único com quatro salas fechadas (reunião, copa,
foco, lounge) encostadas nas bordas e um open space no miolo. A leitura visual
está errada por três motivos:

1. **Ambientes empilhados no mesmo plano.** Cinco funções disputam 60×38 tiles.
   Nenhuma tem espaço para ler como ambiente de verdade; todas ficam apertadas.
2. **Janela como tile isolado.** `T.WINDOW` é um tile 16×16 com um céu pintado
   dentro, aplicado de 3 em 3 tiles. O céu reinicia a cada janela, então não há
   continuidade nem sensação de exterior — parece adesivo na parede.
3. **Baia que não lê como baia.** `deskIsland` + `partition` (painel de 1 tile)
   não formam cubículo. O olho vê mesas soltas com portas em pé no meio da sala.

## Objetivo

Um andar por ambiente. O andar 1 passa a ser o galpão de trabalho — amplo,
com cabines no estilo da série *The Office*, fachada de vidro mostrando o céu de
um arranha-céu, e uma varanda que se atravessa para olhar a vista.

Os ambientes restantes (reunião, copa, foco, lounge) migram para andares
próprios em ciclos seguintes. Este spec cobre **só o andar 1 e a mecânica de
andares**.

## Escopo

**Dentro:**
- Registry de andares e troca de andar por elevador funcional
- Planta completa do andar 1 (72×46 tiles)
- Camada de céu com paralaxe (céu, skyline em duas profundidades, nuvens)
- Vidro como recorte que revela a camada de céu
- Varanda externa em deck com guarda-corpo e modo "apoiar"
- Prop `cubicle` novo (baia em U) e a bagunça determinística de mesa
- Campo `floor` na presença, para não misturar avatares de andares diferentes

**Fora:**
- Plantas dos andares 2, 3 e 4 — aparecem no painel do elevador travadas
- Sala do chefe / sala de reunião envidraçada
- Ciclo de hora do dia no céu (paleta fixa de tarde nesta entrega)
- Mobiliário externo na varanda (bancos, mesinhas)

## Arquitetura

### Andares como dado, motor como intérprete

O `OfficeEngine` hoje recebe um `OfficeMap` e não sabe o que é "copa" — só pinta
tile e prop. Essa fronteira se mantém: o motor continua recebendo **um**
`OfficeMap` e segue ignorante sobre andares. Quem sabe de andar é a camada
React.

```
world/floors/
  index.ts        FLOORS: FloorDef[] — registry, único lugar que lista andares
  floor1.ts       buildFloor1(): OfficeMap — a planta do bullpen
world/map.ts      tipos + helpers (zoneAt, isSolid) — deixa de construir planta
world/sky.ts      camada de céu: build offscreen + draw com paralaxe
world/elevator.ts pura: qual andar está liberado, transição válida ou não
office/world.store.ts  currentFloor + ação de trocar de andar
```

```ts
export interface FloorDef {
  /** 1-based, é o número que aparece no painel do elevador. */
  n: number
  label: string
  /** Ausente = andar em obras: aparece travado no painel. */
  build?: () => OfficeMap
}
```

`map.ts` perde `buildOfficeMap()` e fica só com os tipos (`OfficeMap`, `Seat`,
`Zone`, `LightSource`, `PlacedProp`) e os helpers de consulta. A planta sai de
`floors/floor1.ts`. Isso resolve de saída o problema de `map.ts` virar arquivo
de 800 linhas quando o quarto andar entrar.

Trocar de andar remonta o `OfficeEngine` com o novo mapa. Não há estado de
simulação que precise sobreviver à troca além da posição de spawn — o avatar
sempre chega no hall do elevador do andar de destino.

### Planta do andar 1 (72×46 tiles = 1152×736 px)

O grid contém o prédio **e** o exterior. Fora do envelope do prédio o tile é
`T.VOID`, que passa a significar "aqui se vê o céu" em vez de "borda morta".

```
     0        12   16   24   32   40      53 55   63    71
  0  ┌───────────────────────────────────────────┐
     │ ┌────┐                                    ░   ░ = vidro
     │ │ELEV│    ███  ███  ███  ███              ░   █ = baia
     │ └────┘    ███  ███  ███  ███              ░
     │  RECEP                                    ░
     │  ▤ ▤                                      ░
     │           ███  ███  ███  ███              ░
     │           ███  ███  ███  ███              ░
     │                                           ░
     │                                           ░ ┌──────┐
 37  └░░░░░░░░░░░░░░░░[porta]░░░░░░░░░░░░░░░░░░░░┴─┤ deck │
                                                   │ leste│
 43        ══════════ deck sul ════════════════════╧══════┘
           ═ guarda-corpo na borda externa do deck
 45
```

A fachada leste dá para o deck leste no trecho y = 20..36 e para o céu aberto
acima dele — proposital: de dentro se vê o deck em primeiro plano e a cidade
atrás, o que reforça a altura.

Retângulos, em tiles:

| Elemento | Rect (x, y, w, h) | Notas |
|---|---|---|
| Envelope do prédio | 0, 0, 56, 38 | paredes no contorno |
| Hall do elevador | 1, 1, 10, 12 | piso de ladrilho |
| Cabine do elevador | 2, 2, 4, 4 | zona `elevator` |
| Recepção | 7, 6, 4, 2 | prop `receptionDesk` |
| Bullpen | 12, 2, 42, 34 | assoalho |
| Fachada de vidro sul | 6, 37, 48, 1 | `T.GLASS` |
| Porta de vidro sul | 28, 37, 3, 1 | `T.GLASS_DOOR`, passável |
| Fachada de vidro leste | 55, 4, 1, 32 | `T.GLASS` |
| Deck sul | 20, 38, 36, 6 | `T.DECK` |
| Deck leste | 56, 20, 8, 24 | `T.DECK` — fecha o L na quina |
| Guarda-corpo | bordas externas do deck | `T.RAILING`, sólido |

Baias: 8 clusters de 2, cada cluster ocupando 4×6 tiles — duas baias em U
encostadas de costas, aberturas voltadas para corredores opostos. Os clusters
formam 2 fileiras × 4 colunas: colunas em x = 16, 24, 32, 40 (passo de 8 = 4 de
baia + 4 de corredor) e fileiras em y = 6 e y = 20 (passo de 14). Ocupam até
x = 43 e y = 25, deixando livre a faixa leste do bullpen como circulação até a
porta da varanda. **16 assentos `kind: "pc"`** no total.

Props auxiliares do bullpen: copiadora, dois arquivos de gaveta, bebedouro,
cabideiro, mural de avisos, três plantas, duas luminárias de teto.

### Camada de céu

Novo módulo `world/sky.ts`. Três superfícies pintadas uma vez em canvas
offscreen na montagem, depois só `drawImage` por frame:

| Camada | Conteúdo | Paralaxe |
|---|---|---|
| Céu | degradê vertical de 4 faixas + halo do sol | 0 (fixa) |
| Skyline distante | silhuetas baixas, dessaturadas, sem detalhe | 0.08 |
| Skyline próxima | torres com janelas, topo recortado | 0.15 |
| Nuvens | 5 sprites de nuvem em duas alturas | 0.05 + deriva 2 px/s |

Paralaxe = a camada desloca `fator × posição da câmera`, então andar pelo
escritório move o skyline pouco e as nuvens quase nada. É esse diferencial que
o olho lê como distância.

`sky.ts` expõe duas funções puras testáveis, separadas do desenho:

```ts
buildSky(seed: number): SkyLayers          // canvas offscreen, 1× por sessão
skyOffset(layer, camera, elapsed): {x, y}  // pura — o que os testes checam
```

Ordem de desenho no `engine.ts` passa a ser: **céu → skyline → nuvens → piso →
paredes → props/avatares (ordenados por baseline) → luz**. Hoje o piso é a
primeira camada; o céu entra antes dela.

Aleatoriedade do skyline e das nuvens vem de `hash2` com seed fixa — o mesmo
recurso que os tiles já usam. Mesma seed, mesmo skyline em todas as sessões e
para todos os usuários do workspace.

### Vidro e exterior como recorte

`T.WINDOW` sai. Entram:

- `T.GLASS` — vidro do piso ao teto. Pintado com alfa: caixilho e reflexo
  opacos, miolo transparente. O céu que aparece atrás é a camada de paralaxe,
  contínua entre tiles vizinhos. Sólido.
- `T.GLASS_DOOR` — mesmo visual, com puxador e sem sombra de peitoril. Passável.
- `T.DECK` — piso da varanda: tábuas corridas no sentido da profundidade,
  ligeiramente mais claras que o assoalho interno (está no sol).
- `T.RAILING` — guarda-corpo: montantes verticais com vão entre eles, também
  desenhado com alfa para o céu aparecer no vão. Sólido.
- `T.VOID` deixa de ser pintado: onde o tile é `VOID`, só a camada de céu
  aparece. Segue sólido (ninguém cai do prédio).

### Varanda e o modo apoiar

A varanda é área jogável comum, com zona `terrace` ("Varanda — ar fresco") no
HUD. A diferença está no guarda-corpo: os tiles de deck colados nele recebem
assentos `kind: "view"`.

Apertar E num assento `view`:
1. o avatar assume a animação `lean` (de costas, apoiado no guarda-corpo);
2. a câmera ganha um offset de 40 px para fora do prédio, interpolado em 600 ms
   com o easing que o projeto já usa, revelando mais céu do que caberia estando
   dentro;
3. o zoom não muda — só o alvo da câmera.

Sair com E desfaz nas duas pontas: animação e offset. O offset vive no
`camera.ts` como um alvo somado ao `cameraTarget()` existente, então continua
respeitando o clamp de limites do mapa. `kind: "view"` não abre o PC — só
`kind: "pc"` faz isso, regra que já existe.

### Elevador

O prop `elevator` fica na parede oeste do hall, com portas de metal. A cabine é
uma zona de 4×4 tiles.

Dentro da cabine, E abre o painel: overlay React, estética Win98 reaproveitando
o `win98.css` que já está no bundle. Um botão por andar, vindo de `FLOORS`.
Andar sem `build` aparece travado, com o rótulo "Em obras" e sem resposta ao
clique. Andar atual aparece marcado.

Escolher um andar liberado: fade curto, `currentFloor` muda no store, o
`OfficeRoom` remonta o engine com o novo mapa, e o avatar entra pela cabine do
andar de destino.

`elevator.ts` guarda a decisão em função pura — `canGoTo(floors, from, to)` —
para o teste não precisar de DOM.

### Presença por andar

`PresenceModel` ganha `floor = PositiveSmallIntegerField(default=1)`, com
migration. O heartbeat passa a enviar o andar; a leitura da sala filtra por
andar. Sem isso, os avatares de todos os andares se acumulam sobre a planta de
quem está olhando — bug garantido no primeiro dia em que existirem dois andares.

`x` e `y` continuam normalizados 0..1, agora relativos ao mapa do andar em que
a pessoa está.

## Impacto no que já existe

| O que muda | Por quê |
|---|---|
| `map.ts` perde `buildOfficeMap()` | planta vai para `floors/floor1.ts`; `map.ts` fica com tipos e helpers |
| Ids de assento mudam | o id vem do tile (`ws-<tx>-<ty>`) e a planta é nova; a mesa pessoal de cada um é reatribuída na primeira entrada |
| Zonas `meeting`, `kitchen`, `focus`, `lounge` saem do andar 1 | cada uma volta no seu andar; nada fora de `world/` consome esses ids (verificado: só HUD e minimapa leem `zone`) |
| Assentos `kind: "meeting"` e `"lounge"` desaparecem por ora | voltam com os andares deles; os dois valores continuam em `SeatKind` para não mexer em `isMyDesk` nem no gate do PC |
| `SeatKind` ganha `"view"` | é o assento do guarda-corpo; como só `"pc"` abre o desktop, a regra do PC não muda |
| Props `meetingTable`, `sofa`, `arcade`, `coffeeMachine` ficam sem uso no andar 1 | permanecem em `props.ts` para os próximos andares |
| `__tmp-reach.test.ts` (untracked, falhando hoje) | vira teste de verdade: BFS do spawn tem de alcançar todo assento |

## Testes

Todos em Vitest, sem DOM onde der:

- **Planta** (`floor1.test.ts`): 16 assentos `pc`; BFS do spawn alcança **todo**
  assento e todo tile de deck — é o teste que hoje falha com 3 baias ilhadas;
  vidro é sólido e a porta de vidro não é; guarda-corpo cerca o deck inteiro,
  sem vão para fora; nenhuma baia tem a abertura bloqueada por outro prop.
- **Céu** (`sky.test.ts`): `skyOffset` cresce monotonicamente com a câmera; o
  fator de cada camada respeita a ordem de profundidade; nuvens derivam com o
  tempo e voltam ao início ao passar da largura (loop sem salto).
- **Elevador** (`elevator.test.ts`): `canGoTo` recusa andar sem `build`, recusa
  o andar atual, aceita andar liberado; painel lista todos os andares do
  registry.
- **Câmera** (`camera.test.ts`, existente): offset de apoiar não fura o clamp de
  limites do mapa em nenhuma quina.
- **Store de andar** (`world.store.test.ts`): trocar de andar zera o alvo de
  movimento e posiciona no spawn do destino.
- **Backend** (`test_presence.py`): heartbeat grava o andar; a listagem da sala
  não devolve quem está em outro andar.

## Riscos

| Risco | Mitigação |
|---|---|
| Mesa pessoal de todos muda de lugar | avisar no HUD na primeira entrada; ids continuam derivados do tile, então estáveis a partir daí |
| Camada de céu com custo por frame | três `drawImage` de canvas pré-pintado; nada de pintar pixel em runtime |
| Vidro com alfa quebrando a ordenação por profundidade | vidro é parede: entra na camada de paredes, antes dos props, como os tiles sólidos de hoje |
| Andar grande deixando o mundo vazio | 16 baias na área útil do bullpen; a varanda absorve o perímetro em vez de virar corredor morto |
