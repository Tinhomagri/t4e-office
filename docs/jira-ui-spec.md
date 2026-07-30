# Estrutura da UI do Jira — medições reais

Fonte: `t4e.atlassian.net`, projeto VAL, board 530 (Jira Software team-managed, nav nova,
tema escuro). Medido via DevTools em viewport 1920px. Cores em dark; para light usar os
tokens equivalentes do nosso Tailwind.

## 1. Shell / navegação global

| Região | Medida real | Nosso equivalente |
|---|---|---|
| Top nav (`page-layout.top-nav`) | `h=48px`, `padding 0 12px`, `gap 8px`, `bg #1F1F21`, grid | `AppShell.tsx` → `h-12` ✅ ajustado |
| Busca global | `780x32`, `radius 6px`, `bg #2B2C2F` | idem |
| Side nav (`page-layout.side-nav`) | `w=320px`, `bg #1F1F21`, `border-right 1px rgba(227,228,242,.12)` | `SIDEBAR_DEFAULT_WIDTH = 320` ✅ ajustado (min 200 / max 400) |
| Item de sidebar | `h=32px`, `font 14/20 w400` | `AppShell.tsx:463` — `py-1.5 text-sm` ≈ 32px ✔ |
| Header do projeto | `h=32px`, `gap 6px`, título `28px`, ícone `20x20` | `BoardsPage.tsx` header |
| Tab bar | tab `98x32`, `padding 16px 10px 16px 6px`, `font 14 w500`; selecionada `color #669DF1`, **sem** border-bottom | `BoardsPage.tsx` → `h-8 px-2.5 text-sm font-medium`, sublinhado removido ✅ ajustado |

Notas estruturais:
- Root é `display: grid` (`page-layout.root`), não flex — top-nav / side-nav / content
  como áreas de grid. Sidebar começa em `y=48`, altura total `943`.
- Aba selecionada não usa sublinhado: só cor de texto azul (`#669DF1`).

## 2. Board (Quadro)

```
board.content.board-wrapper        1600x771
 └─ row (flex, gap 12px)           1448x739
     └─ coluna                     280x739
         └─ board.content.cell     280x420   bg #18191A   radius 12px
             ├─ header             280x44    padding 6px 8px 6px 12px  (bg transparente)
             │   ├─ nome           font 14/20 w500  color #A9ABAF
             │   └─ contador       font 12/16 w500  color #A9ABAF
             └─ scroll-container   280x336   padding 1px 4px  gap 4px  overflow-y auto
                 └─ card           272x80    radius 8px  bg #242528
```

| Elemento | Jira | Nosso (`views/KanbanView.tsx`) | Status |
|---|---|---|---|
| Largura do card | `272px` | coluna `w-[284px]` − `px-1` − `border-2` = 272 | ✅ ajustado |
| Gap entre colunas | `12px` | `gap-3` + `minWidth (n+1)*296` | ✅ |
| Radius da coluna | `12px` | `rounded-xl` | ✅ ajustado |
| Radius do card | `8px` | `rounded-lg` no `CardCell` e no slot fantasma | ✅ ajustado |
| Gap entre cards | `4px` | `gap-1` | ✅ ajustado |
| Padding da lista | `1px 4px` | `px-1 py-px` | ✅ ajustado |
| Header da coluna | `44px`, `6/8/6/12` | `px-3 pt-3 pb-2` | ≈ mantido |
| Nome da coluna | `14/20 w500` | `text-sm font-medium leading-5` | ✅ ajustado |
| Contagem | `12/16 w500` | `text-xs font-medium leading-4` | ✅ ajustado |
| Título do card | `14/20 w400`, sem clamp | `text-sm font-normal leading-5` + `line-clamp-2` | ✅ ajustado (clamp é nosso) |
| Chave (VAL-41) | `12/16 w500 #A9ABAF` + ícone tipo `16x16` | ✔ | ✅ |
| Avatar no card | `24x24` | `size-6` | ✅ |
| Sombra do card | `0 1px 1px rgba(1,4,4,.5)`, `0 0 1px rgba(1,4,4,.5)` | `shadow-card` | ≈ mantido |

Toolbar do board: busca `160x32` (input interno `134x28`), botões `32x32` `radius 6px`
fundo transparente, avatar de filtro `28x28`. Nosso toolbar usa pills `rounded-full` —
divergência **deliberada** de estilo, não de estrutura.

## 3. Detalhe da issue (`/browse/VAL-41`)

Layout de 2 colunas dentro do content:

```
container-left   ~941px  (começa em x=348, ou seja 28px após a sidebar de 320)
container-right   572px  padding 0 0 0 4px
 └─ right-most-column  568x709  padding 20px 24px 32px 4px
     └─ visibility-container 540
         ├─ status/ações        540x56
         ├─ painel "Informações" 540x436  (campos)
         ├─ painel colapsado     540x50   radius 8px  bg #1F1F21  border 1px rgba(227,228,242,.12)
         └─ automação            548x48   margin-bottom 24px
```

- `h1` do título: `24/28 w650`.
- Breadcrumbs: `font 14px`.
- Label de campo: `14/14 w400`; valor à direita, linha de ~36px.
- Botão de status: `167x32`, `radius 6px`, `bg rgba(206,206,217,.07)`, `padding 0 10px`.
- Headings de seção no corpo: `16/20 w600`; headings de bloco (Subtarefas): `16/20 w650`.
- Painéis da direita **não** têm fundo próprio quando expandidos — só o colapsado ganha
  card com borda e radius 8px.

Nosso equivalente é `CardDrawer.tsx` (drawer), não página. Estrutura de duas colunas é a
mesma ideia; para paridade real falta a rota `/browse/<KEY>` como página inteira.

## 4. Backlog

**Indisponível neste projeto** — `/boards/530/backlog` retorna 404 ("A visualização não
existe neste quadro"). O board VAL é team-managed sem backlog habilitado, e a nav nova
lista só: Resumo, Cronograma, Quadro, Calendário, Lista, Formulários, Metas,
Desenvolvimento, Código, Tickets arquivados, Documentos. Para clonar o backlog é preciso
um projeto com a view ligada.

## 5. Paridade das abas

Jira (VAL): Resumo · Cronograma · Quadro · Calendário · Lista · Formulários · Metas ·
Desenvolvimento · Código · Tickets arquivados · Documentos · Atalhos.

Nosso `BoardsPage.tsx` (`PROJECT_VIEWS`): Resumo · Quadro · Backlog · Lista · Cronograma ·
Calendário · Marketing · Metas · Desenvolvimento · Documentos · Automações.

Faltam: Formulários, Código, Tickets arquivados, Atalhos.
