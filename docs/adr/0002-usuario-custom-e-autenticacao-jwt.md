# ADR 0002 — Usuário custom (email) e autenticação JWT

**Status:** Aceito · 2026-06-25

## Contexto

RF-01 exige cadastro, login, perfis e papéis. O frontend é uma SPA React separada do
backend; precisamos de auth stateless e sem `username` (login por email).

## Decisão

- `UserModel` custom (`AbstractBaseUser` + `PermissionsMixin`), `USERNAME_FIELD = "email"`,
  PK UUID, verificação de email antes de ativar (`is_active`/`email_verified`).
- Autenticação via **JWT** (`djangorestframework-simplejwt`): `/api/auth/login/`,
  `/api/auth/refresh/`, `/api/auth/me/`.
- Papéis não ficam no User global e sim por workspace, em `MembershipModel.role`
  (`owner`/`admin`/`member`) — um usuário pode ter papéis diferentes em workspaces diferentes.

## Consequências

- (+) SPA stateless; escala horizontal sem sessão compartilhada.
- (+) Papel por workspace modela times reais melhor que role global.
- (−) JWT stateless dificulta revogação imediata; access tokens curtos + refresh mitigam.
- (−) Trocar `AUTH_USER_MODEL` depois seria caro — decidido no início de propósito.
