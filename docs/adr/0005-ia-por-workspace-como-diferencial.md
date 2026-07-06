# ADR 0005 — IA (Claude/OpenAI) configurável por workspace

**Status:** Aceito · 2026-07-02

## Contexto

Diferencial "funcionalidade assistida por IA" pesa no produto e na categoria de uso de IA.
Times diferentes têm provedores/chaves diferentes e não queremos uma chave global no código.

## Decisão

- Configuração de IA **por workspace** (provedor Claude/OpenAI + credencial), não global.
- Copiloto isolado no contexto `copilot`: chat agêntico que cria/edita cards e gera relatórios.
- Chaves ficam fora do repositório (`.env` / config do workspace), nunca commitadas.

## Consequências

- (+) Cada time usa seu provedor sem vazar chave no código.
- (+) Copiloto desacoplado — dá para trocar provedor sem tocar no resto.
- (−) Mais superfície de configuração/erro (chave ausente/ inválida). Mitigação: validação
  e mensagens claras quando a IA não está configurada.
