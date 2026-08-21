# Profile Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma página completa e segura para editar perfil, preferências e senha.

**Architecture:** O perfil permanece no contexto `identity`, com campos estruturados em `UserModel` e atualização pelo recurso autenticado `/auth/me/`. A página React isola conta, preferências e segurança, atualizando o store autenticado após cada gravação.

**Tech Stack:** Django REST Framework, PostgreSQL, React, TypeScript, Zustand, Tailwind CSS, Vitest e pytest.

## Global Constraints

- A rota é `/app/perfil` e usa o `AppShell` existente.
- A senha atual nunca é armazenada nem retornada.
- A foto é comprimida para WebP no cliente antes do PATCH.
- Cada seção tem envio e feedback independentes.

---

### Task 1: Perfil persistente e API

**Files:**
- Modify: `backend/src/contexts/identity/infrastructure/django/models.py`
- Create: `backend/src/contexts/identity/migrations/0010_usermodel_profile_fields.py`
- Modify: `backend/src/contexts/identity/interface/api/serializers.py`
- Modify: `backend/src/contexts/identity/interface/api/views.py`
- Modify: `backend/src/contexts/identity/interface/api/urls.py`
- Test: `backend/src/contexts/identity/tests/test_profile_api.py`

**Interfaces:**
- Produces: `GET/PATCH /auth/me/` com `job_title`, `phone`, `bio`, `location`, `timezone`, `language`, `theme`, `density`, `notification_preferences`, `availability`.
- Produces: `POST /auth/me/change-password/` com `{current_password,new_password}`.

- [ ] Escrever testes de leitura e atualização dos novos campos.
- [ ] Executar `pytest src/contexts/identity/tests/test_profile_api.py -q` e confirmar falha inicial.
- [ ] Adicionar campos, migração, serialização e validações enumeradas.
- [ ] Adicionar troca de senha autenticada usando `check_password` e `set_password`.
- [ ] Executar os testes de identity e confirmar sucesso.

### Task 2: Cliente e página de perfil

**Files:**
- Modify: `frontend/src/features/auth/auth.types.ts`
- Modify: `frontend/src/features/auth/auth.api.ts`
- Create: `frontend/src/features/profile/ProfileSettingsPage.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/features/shell/AppShell.tsx`

**Interfaces:**
- Consumes: perfil ampliado de `/auth/me/`.
- Produces: `changePassword(payload)` e página `/app/perfil`.

- [ ] Ampliar `AuthUser`, payload de perfil e cliente de troca de senha.
- [ ] Criar cabeçalho de identidade com upload, remoção e prévia do avatar.
- [ ] Criar seções Conta, Preferências e Segurança com envios independentes.
- [ ] Atualizar `useAuthStore` após salvar e trocar o menu compacto por navegação para a página.
- [ ] Adicionar rota protegida `/app/perfil`.

### Task 3: Verificação integrada

**Files:**
- Test: `backend/src/contexts/identity/tests/test_profile_api.py`
- Verify: `frontend/src/features/profile/ProfileSettingsPage.tsx`

**Interfaces:**
- Consumes: API e UI concluídas.
- Produces: feature pronta para teste local.

- [ ] Executar `python manage.py check` e testes de identity.
- [ ] Executar `npm test -- --run`.
- [ ] Executar `npm run build` e corrigir erros de TypeScript ou bundle.
- [ ] Revisar `git diff --check` e o estado final do repositório.
