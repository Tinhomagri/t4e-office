# MCP do t4e-office

Servidor MCP remoto que permite criar/listar cards do t4e-office direto pelo
Claude (chat ou terminal), sem precisar abrir o navegador.

## Como conectar

1. Loga no office (`https://office.t4egroup.com.br`), vai em
   **Configurações → Tokens de API → Gerar novo token**. Copia o valor —
   ele só aparece uma vez.
2. No Claude, adiciona um servidor MCP remoto:
   - URL: `https://mcp.t4egroup.com.br/mcp`
   - Autenticação: cola o token copiado (header `Authorization: Bearer <token>`)
3. Pronto. Pede algo tipo "cria um card X no projeto Y" e o Claude usa a
   ferramenta `create_card` direto.

## Revogar acesso

Voltando em Configurações → Tokens de API, dá pra revogar qualquer token a
qualquer momento — sem precisar de ninguém do time técnico.

## Ferramentas disponíveis

- `list_workspaces` — lista os workspaces do usuário dono do token
- `list_projects(workspace_id)` — lista projetos de um workspace
- `create_card(project_id, title, description?, status?, type?, priority?, labels?)`
  — cria um card

## Desenvolvimento local

```bash
cd mcp-server
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
T4E_API_URL=http://localhost:8000 ./.venv/bin/python3 server.py
```
