# Animação de arraste do Kanban no padrão Jira

## Objetivo

Fazer o arraste de cards do Kanban do T4 Office responder como o Jira: o gesto
deve permanecer contínuo desde o levantamento até o assentamento, sem o card
piscar, voltar à origem ou esperar a API para aparecer no destino.

O escopo inclui cards dentro da mesma coluna e entre colunas. A ordenação por
rank, swimlanes, filtros e o arraste de colunas existentes serão preservados.

## Diagnóstico

O CRM do Conecta mantém o item original no board com opacidade reduzida, move
uma prévia pelo cursor e atualiza o estado local no mesmo evento do drop. Isso
evita um frame intermediário com os dados antigos.

O T4 Office tenta fazer a mesma atualização otimista, mas usa a chave exata
`["cards", projectId]`. A consulta consumida pelo Kanban usa
`["cards", projectId, jql, includeOldDone]`. Como as chaves não coincidem, a
atualização não alcança os dados renderizados: quando a prévia desaparece, o
card reaparece na posição anterior e só muda após a resposta da API.

Além disso, a implementação em andamento adicionou efeitos que divergem das
diretrizes atuais da Atlassian, como rotação da prévia. As diretrizes pedem uma
prévia sem rotação, o item original com 40% de opacidade, indicação inequívoca
do destino e atualização otimista no drop.

## Interação aprovada

### Início do arraste

- O card começa a arrastar somente após o limiar de oito pixels, evitando
  cliques acidentais.
- O card original continua ocupando seu slot e fica com 40% de opacidade.
- Uma prévia fiel do card acompanha o ponto em que ele foi agarrado.
- A prévia não gira e não compete pelo mesmo `transform` do card original.

### Durante o arraste

- Cards vizinhos abrem espaço por meio do `useSortable`.
- A coluna sob o cursor recebe um realce de fundo/borda com transição suave.
- Um indicador azul de dois pixels marca a posição relativa de inserção entre
  cards. Em coluna vazia, somente o realce da coluna é mostrado.
- O estado temporário de posicionamento permanece apenas no cliente; nenhuma
  requisição é disparada durante o movimento do ponteiro.

### Drop

- O card é gravado imediatamente em todas as entradas relevantes do cache de
  cards, usando correspondência parcial da chave da consulta.
- A prévia assenta no slot de destino sem revelar a posição anterior entre o
  fim do overlay e a atualização do board.
- O card movido recebe um flash azul discreto para confirmar o resultado.
- As chamadas de alteração de status e rank continuam assíncronas.
- Se uma chamada falhar, o cache anterior é restaurado e o erro existente da
  aplicação é apresentado; o board não permanece em um estado falso.

### Cancelamento e acessibilidade

- Cancelar o gesto remove todos os estados transitórios sem alterar status ou
  rank.
- `prefers-reduced-motion` elimina o voo de assentamento e o flash animado, mas
  mantém opacidade e indicadores necessários para compreender o destino.
- Os atributos de acessibilidade fornecidos pelo `dnd-kit` serão preservados.

## Arquitetura

O `DndContext` continuará sendo compartilhado por cards e colunas, com IDs de
coluna prefixados por `col:`. O `DragOverlay` continuará em portal no `body`
para não ser recortado pelo contêiner horizontal.

A lógica pura de calcular o resultado do drop será extraída para um pequeno
módulo do board. Ela receberá a lista atual, o card ativo e o alvo e retornará:

- o status de destino;
- a nova ordem otimista;
- os IDs `beforeId` e `afterId` usados pelo Lexorank.

Essa separação permite testar a regressão sem simular eventos de ponteiro ou a
geometria do navegador. O componente permanece responsável apenas por estados
visuais e por disparar as mutations.

## Tratamento de dados

Todas as variantes de `cards` do projeto serão atualizadas com
`setQueriesData({ queryKey: ["cards", projectId] })`. Cada variante manterá seus
próprios filtros: somente listas que já contêm o card serão reordenadas, sem
inserir artificialmente o card em resultados JQL que não o continham.

Antes da atualização otimista, serão capturados snapshots das consultas
afetadas. Em erro de status ou rank, esses snapshots serão restaurados. Em
sucesso, a invalidação já existente reconciliará o estado com o servidor.

## Testes

Os testes unitários cobrirão:

1. movimento entre colunas atualizando status e ordem imediatamente;
2. reordenação dentro da mesma coluna;
3. drop no início, no meio e no vazio de uma coluna;
4. preservação de consultas que não contêm o card;
5. restauração do snapshot quando a persistência falha;
6. ausência de rotação e presença dos estados visuais exigidos no arraste.

A validação final incluirá os testes direcionados, a suíte do frontend, a
checagem TypeScript e o build de produção.

## Fora de escopo

- Trocar `dnd-kit` pela biblioteca Pragmatic Drag and Drop da Atlassian.
- Alterar endpoints, o formato de Lexorank ou regras de workflow.
- Redesenhar os cards, colunas, filtros ou swimlanes.
- Mudar a experiência de arraste de colunas.

