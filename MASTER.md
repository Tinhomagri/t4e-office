# MASTER — Identidade Visual Isométrica (estilo Habbo Hotel)

Fonte única de verdade para a conversão do escritório de câmera top-down para
isométrica 2.5D. Todo token/constante de projeção, cor ou desenho referenciado
aqui — nada de número mágico solto em outro arquivo.

## Tese Visual

Quartos isométricos pixel-art estilo Habbo: piso em grid de losangos 2:1,
paredes erguidas no ângulo iso com sombreamento por face (topo claro, laterais
escuras), avatares chibi (cabeça grande, corpo pequeno, contorno preto grosso)
parados sobre o losango, props na mesma projeção com o mesmo contorno+sombra.
Paleta existente (amarelo/madeira/verde) mantida, só reprojetada.

## Tese de Interação

Câmera isométrica fixa (45° rotação / ~30° inclinação), sem rotação livre nem
tilt 3D real — continua canvas 2D puro, só a projeção matemática muda.
Movimento WASD/clique anda nos dois eixos diagonais da tela. Clique-pra-andar
projeta de volta pro losango certo. Profundidade ordena por linha+coluna do
grid (regra isométrica padrão), não mais por Y do sprite.
Proibido: rotacionar câmera, perspectiva variável, qualquer coisa 3D real.

## Arquitetura da Projeção

A física, colisão e posição de atores continuam em **espaço de mundo
cartesiano** (pixels, `TILE = 16`), exatamente como hoje — WASD, colisão,
`zoneAt`, `isSolid` não mudam. Só a camada de DESENHO (mundo → tela) passa a
projetar em isométrico. Isso preserva a arquitetura de "assar uma vez, no
frame só faz blit" que já sustenta os 60fps.

### Constantes de projeção (`world/iso.ts`)

```
ISO_TILE_W = 32   // largura do losango de piso, em px de tela (1×)
ISO_TILE_H = 16   // altura do losango de piso, em px de tela (1×)
// Fatores derivados, aplicados sobre coordenadas de mundo em pixels
// (TILE = 16 já embutido nas constantes acima → fator "limpo"):
ISO_FX = ISO_TILE_W / TILE / 2  // = 1
ISO_FY = ISO_TILE_H / TILE / 2  // = 0.5
```

### Projeção (mundo → iso)

```
isoX = (worldX - worldY) * ISO_FX
isoY = (worldX + worldY) * ISO_FY
```

### Inversa (iso → mundo, usada no clique-pra-andar)

```
worldX = isoX / (2 * ISO_FX) + isoY / (2 * ISO_FY)
worldY = isoY / (2 * ISO_FY) - isoX / (2 * ISO_FX)
```

### Bake do piso

O piso/paredes continuam assados UMA vez num canvas offscreen — só que agora
do TAMANHO DO LOSANGO PROJETADO (retângulo que contém o mapa rotacionado):

```
isoMapW = (cols + rows) * (ISO_TILE_W / 2)
isoMapH = (cols + rows) * (ISO_TILE_H / 2) + alturaMaximaDeParede
```

Cada tile é blitado na posição `isoX, isoY` (deslocada para caber no
retângulo, com origem no vértice esquerdo do losango). Fora do losango, o
canvas fica transparente — revela o céu atrás, igual ao vidro hoje.

A câmera (`camera.ts`) continua recortando um RETÂNGULO deste raster já
assado — a lógica de `integerScale`, `viewportFor`, `cameraTarget`,
`offsetCamera` não muda de forma; só os "limites do mundo" que ela usa passam
a ser `isoMapW`/`isoMapH` em vez de `map.width`/`map.height`.

### Ordenação de profundidade

Depth-sort por `(tileRow + tileCol)` — quem está mais para "baixo-direita" no
grid desenha por cima. Substitui o `base = actor.y` usado hoje (que só fazia
sentido em top-down puro).

### Direções do avatar

Mantém as 4 direções existentes (`up/down/left/right`) mapeadas para os eixos
diagonais da tela iso — não vira 8 direções nesta fase (ver "Próximos
passos").

## Paleta e sombreamento por face (piso/parede)

Regra herdada de `pixels.ts` (`shade`/`tint`), agora aplicada por FACE do
bloco isométrico:

- Topo do piso (losango): cor base, sem alteração.
- Face esquerda da parede: `shade(cor, 0.82)`.
- Face direita da parede / topo da parede: `tint(cor, 1.08)` no topo,
  `shade(cor, 0.6)` nas laterais — mesma proporção de contraste que
  `drawWallTop` já usa hoje, só reaplicada nas duas faces iso em vez de uma
  face frontal única.

## Escopo desta fase

1. `world/iso.ts` — matemática pura de projeção (testável, sem canvas).
2. `world/tiles.ts` — piso vira losango, parede ganha face esquerda/direita.
3. `world/engine.ts` — bake e render usando o raster iso; depth-sort por
   linha+coluna.
4. `world/camera.ts` — `screenToWorld` passa pela inversa iso.

## Próximos passos (fora desta fase, itens separados)

- Props (`props.ts`): por ora mantêm o desenho pixel-art atual (flat,
  ancorado no pé do sprite), só reposicionados pela projeção iso. Redesenhar
  cada móvel em ângulo isométrico de verdade é trabalho de arte separado,
  prop por prop — não travar a entrega da câmera nisso.
- Avatar (`chibi.ts`): mantém 4 direções; 8 direções (diagonais reais) fica
  para uma fase seguinte, se o resultado em 4 direções não convencer.
- Minimapa: continua ortogonal (top-down puro) — é o padrão em jogos
  isométricos (planta simplificada), não precisa de projeção iso.
