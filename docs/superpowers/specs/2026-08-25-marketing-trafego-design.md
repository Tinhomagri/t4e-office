# Marketing / Tráfego — design

Data: 2026-08-25
Origem: porte fiel do módulo **Tráfego** do T4E OS (`t4e-os.zip`, `apps/web/src/{services,app/api,types}/trafego*`)
para o nosso `marketing`, sem alterar o que já existe (Postagem/`contexts/integrations` fica intocado).

## Objetivo

Trazer o painel de investimento em anúncios (Meta Marketing API) — visão geral,
série diária, anúncios, campanhas, público, funil e conciliação de vendas —
pro módulo marketing do t4e-office, com o mesmo comportamento do T4E OS.
Credenciais reais (token Meta, planilhas) ficam pendentes de configuração —
"ligamos o restante depois": o código sobe funcional, mas sem dado real até
alguém preencher as variáveis de ambiente.

## Escopo

Portado 1:1 (lógica igual, stack traduzida Next.js/TS → Django/Python):

- **5 relatórios de leitura pura da Meta Ads API**: geral, série diária,
  anúncios, campanhas, público.
- **Funil**: cruza dados de anúncio com a planilha histórica de leads (UF,
  contato, etapa).
- **Vendas**: concilia planilha de fechados + histórico de leads + gasto por
  anúncio, casando por telefone (e por nome como fallback mais frágil).
- **Miniatura do criativo**: proxy de imagem (evita CSP aberta pro CDN da Meta).
- **Prévia do anúncio**: proxy do HTML/iframe que a Meta devolve.

Fora de escopo agora (fica pra depois, quando decidirmos capturar atribuição
de anúncio direto no CRM):

- Ligar `funil`/`vendas` ao `contexts/sales` (Lead/Deal) em vez de CSV.
- Configuração de credenciais por workspace via UI (por ora: variáveis de
  ambiente globais, igual o T4E OS faz com `getTrafegoEnv()`).

## Arquitetura

Novo contexto Django `backend/src/contexts/traffic/`, espelhando a estrutura
de `contexts/integrations`:

```
contexts/traffic/
  infrastructure/
    meta_api.py        — porte de services/trafego/graph.ts (chamada à Graph API,
                          MetaError, faixaDeDatas)
    sheets.py           — porte de services/trafego/planilhas.ts (baixar CSV
                          publicado do Sheets, parsing, normalização de telefone)
    geografia.py         — porte de services/trafego/geografia.ts (UF → centróide)
    reports.py           — porte de services/trafego/relatorios.ts (visaoGeral,
                          serieDiaria, listarAnuncios, listarCampanhas,
                          perfilDoPublico, montarFunil, urlDaMiniatura, previaDoAnuncio)
    sales_reconciliation.py — porte de services/trafego/vendas.ts (calcularVendas,
                          cruzarVendas)
  interface/api/
    views.py             — 3 views (relatório, miniatura, prévia), mesma casca
                          de tratamento de erro que o Next.js tinha em rota única
    urls.py
  tests/
    test_reports.py
    test_sales_reconciliation.py
```

Todas as funções batem direto na Meta Graph API via `httpx` (já é dependência
do projeto — usado em `social_publisher.py`). Sem OAuth aqui: a Marketing API
usa token de sistema (`System User`) de longa duração, igual o T4E OS assume —
não expira em 60 dias como o token de usuário do Instagram.

### Config (env vars, `backend/src/config/settings/base.py`)

```python
META_TRAFFIC_ACCESS_TOKEN = os.environ.get("META_TRAFFIC_ACCESS_TOKEN", "")
META_AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "")
TRAFFIC_SHEET_FECHADOS_URL = os.environ.get("TRAFFIC_SHEET_FECHADOS_URL", "")
TRAFFIC_SHEET_HIST_URL = os.environ.get("TRAFFIC_SHEET_HIST_URL", "")
```

Sem valor configurado → endpoints devolvem `CONFIG_ERROR` (mesmo padrão que
`social_oauth`/`social_publisher` já usam pra "provider não configurado"), a
tela mostra aviso em vez de quebrar — igual o T4E OS faz hoje.

### Endpoints (`/api/traffic/`)

| Rota | Espelha |
|---|---|
| `GET /api/traffic/report/<relatorio>/?since=&until=` | rota `[relatorio]` do T4E OS — `geral\|serie\|anuncios\|campanhas\|publico\|funil\|vendas` |
| `GET /api/traffic/miniatura/?ad_id=` | proxy de imagem |
| `GET /api/traffic/previa/?ad_id=&formato=` | proxy de HTML da prévia |

`vendas` ignora `since`/`until` de propósito (mesma razão do original: venda
fecha 1–2 meses depois do lead — recortar por período atribuiria faturamento
a gasto que não o gerou).

Rate limit por usuário (não por IP, já que temos auth): usar o mesmo
mecanismo de throttle do DRF (`UserRateThrottle` com scope próprio), valores
equivalentes aos do T4E OS (90/min relatório, 400/min miniatura, 60/min prévia).

## Frontend

Novo arquivo `frontend/src/features/marketing/TrafficPage.tsx`, seguindo o
padrão das telas existentes (`Panel`, `MetricStrip`, `Toolbar`,
`useCommandPalette` do `@/shared/ui/command-center`). Abas internas (não
rotas separadas, pra não inchar `router.tsx`): Geral, Anúncios, Campanhas,
Público, Funil, Vendas — mapeando os 5 `app/trafego/*/page.tsx` do T4E OS.

```
frontend/src/features/marketing/traffic.api.ts   — porte de services/api/trafego.ts
frontend/src/features/marketing/traffic.types.ts — porte de types/trafego.ts
```

Nova rota em `router.tsx`:
```
{ path: "marketing/trafego", element: <TrafficPage /> }
```
+ entrada correspondente no `MarketingDeck.tsx` (hub de módulos).

Miniatura e prévia consumidas via `<img src="/api/traffic/miniatura/?ad_id=...">`
e `<iframe src=".../previa/?...">` — mesma lógica de proxy, sem CSP nova (já
é same-origin).

## Tratamento de erro

Mesma filosofia do T4E OS: distinguir erro de configuração (token/planilha
ausente) de erro da Meta (rate limit, permissão). Backend devolve
`{"error": {"code": "CONFIG_ERROR" | "META_ERROR", "message": "..."}}`;
frontend mostra `EmptyState` com a mensagem em vez de tela quebrada — mesmo
padrão que `SocialAccountsPage` já usa pra conta desconectada.

## Testes

- `test_reports.py`: parsing de insights da Meta (fixture de resposta JSON),
  cálculo de CTR/CPC/CPL.
- `test_sales_reconciliation.py`: casamento por telefone e por nome com CSV
  de fixture (portar os casos que já existiam nos comentários do `vendas.ts`
  do T4E OS — casamento por telefone é o caminho feliz, por nome é o
  fallback frágil que o sistema precisa continuar contabilizando à parte).

## Não-metas explícitas

- Não mexe em `contexts/integrations` (Postagem) nem no CRM (`contexts/sales`).
- Não implementa configuração de credencial por workspace via UI agora —
  variável de ambiente global, como o T4E OS sempre fez.
- Não migra a conciliação pra ler do CRM em vez de CSV — decisão futura,
  precisa antes decidir como capturar atribuição de anúncio no lead.
