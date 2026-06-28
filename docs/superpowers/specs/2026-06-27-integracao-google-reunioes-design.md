# Integração Google + Reuniões — Design

**Data:** 2026-06-27
**Status:** Aprovado (design), pendente plano de implementação
**Contexto:** Plataforma Pulse (Django DDD + React). Auth atual = email/senha + JWT.

## Objetivo

Permitir que o usuário (já logado por email/senha) **conecte sua conta Google** e
conceda permissão da Google Agenda, para que a plataforma possa **agendar reuniões**
com link do Google Meet, ler disponibilidade, listar próximos eventos e convidar
participantes via convite nativo do Google.

## Escopo

**Dentro:**
- Conexão OAuth Google (account linking, não é login).
- Criação de evento na Agenda com Meet automático + convidados.
- Leitura de disponibilidade (suggest times).
- Listagem de próximos eventos no app.
- Convite de participantes (convite Google nativo).

**Fora (subsistema futuro #3 — Escritório Virtual):**
- Sala de vídeo própria (WebRTC/SFU/serviço 3º).
- Chat ao vivo.
- O link da call por ora é **Google Meet automático**; escritório próprio entra depois.

**Decisões do usuário:**
- Login continua email/senha; Google **só vincula** conta existente + dá permissão Agenda.
- Usos da Agenda: criar evento, ler disponibilidade, listar eventos, convidar participantes (todos).
- Link da call: **Google Meet automático**.
- Reunião nasce de **botão "Agendar reunião"** dedicado (escolhe pessoas + horário).

## Arquitetura

Novo bounded context **`google`** (mesmo padrão DDD dos outros contexts), 2 partes:

### a) Conexão OAuth
- **Entity `GoogleConnection`**: vincula `user_id` ↔ conta Google.
  Campos: `refresh_token` (cifrado), `access_token`, `expiry`, `scopes`,
  `google_email`, `status` (`active` | `revoked`).
- **Port `OAuthProvider`** (impl Google): gera URL consent, troca code→tokens, refresh.
- **Use cases:**
  - `get_authorization_url` — gera URL + `state` (CSRF).
  - `handle_oauth_callback` — valida state, troca code→tokens, cifra e salva.
  - `disconnect_google` — remove/inativa conexão.
  - `get_valid_credentials` — retorna access token válido, faz refresh automático;
    se refresh falhar → marca `status=revoked`.

### b) Reuniões / Agenda
- **Port `CalendarGateway`** (impl Google Calendar API).
- **Use cases:**
  - `create_meeting` — cria evento + `conferenceData` (Meet) + attendees.
  - `list_upcoming_events` — próximos eventos.
  - `suggest_times` — disponibilidade (freebusy) p/ sugerir horários.
- **`MeetingRef`** (referência leve): `google_event_id`, `card_id` opcional.
  Google é a fonte da verdade do evento; app guarda só referência p/ listar/cancelar.

### Segurança
- `refresh_token` cifrado (Fernet, chave dedicada em settings/env, **fora do git**).
- Tokens nunca expostos ao frontend — só `meet_link` / `event_id` / `htmlLink`.
- `state` OAuth = token aleatório com TTL curto, validado no callback.
- Escopos mínimos: `calendar.events`, `calendar.readonly`, `userinfo.email`.
- `access_type=offline` + `prompt=consent` p/ garantir refresh_token.

## Fluxo de dados

### Conectar Google (uma vez por usuário)
```
Front clica "Conectar Google"
 → GET  /api/google/auth-url            (backend gera URL consent, state=CSRF)
 → redirect p/ Google → usuário aceita escopos
 → Google → /api/google/callback?code&state
 → backend valida state, troca code→tokens, cifra refresh_token, salva GoogleConnection
 → redirect front "conectado ✓"
```

### Agendar reunião
```
Front "Agendar reunião": titulo, participantes (emails), duração
 → (opcional) GET /api/google/availability?attendees&range  → suggest_times
 → POST /api/google/meetings {titulo, inicio, fim, attendees}
 → backend get_valid_credentials (refresh se expirado)
 → CalendarGateway.create_event(conferenceData=Meet, attendees)
 → Google dispara convites nativos + gera Meet link
 → salva MeetingRef, retorna {event_id, meet_link, htmlLink}
```

### Listar (Meu Dia)
```
GET /api/google/events/upcoming → list_upcoming_events → cards no front
```

## Tratamento de erros

| Caso | Resposta |
|---|---|
| Usuário nega consent | callback sem `code` → redirect front "permissão negada" |
| `state` inválido | 400, aborta (CSRF) |
| refresh_token revogado | `status=revoked`, 409 nas chamadas → front pede reconectar |
| Google API 5xx/timeout | retry curto (1x) + 502 amigável |
| Sem conexão Google ao agendar | 409 "conecte Google primeiro" |
| Rate limit Google (403/429) | backoff, log, erro claro |

## Testes

- Domínio/use cases: unit puro com `OAuthProvider` e `CalendarGateway` fakes.
- Cifragem: round-trip encrypt/decrypt do refresh_token.
- Callback: state válido/inválido, code ausente.
- `create_meeting`: payload correto (conferenceData Meet, attendees); 409 sem conexão.
- Refresh: expirado→renova; revogado→marca `status=revoked`.
- Google API real fica fora de CI (mock/VCR).

## API endpoints (resumo)

| Método | Rota | Função |
|---|---|---|
| GET  | `/api/google/auth-url` | URL de consent |
| GET  | `/api/google/callback` | callback OAuth |
| GET  | `/api/google/status` | conectado? email? status |
| POST | `/api/google/disconnect` | desvincular |
| GET  | `/api/google/availability` | sugerir horários |
| POST | `/api/google/meetings` | criar reunião + Meet |
| GET  | `/api/google/events/upcoming` | próximos eventos |

## Config / env novos

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_TOKEN_ENC_KEY` (Fernet, fora do git)
