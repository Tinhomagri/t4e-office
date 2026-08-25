# Task 1 report — allowed_spaces backend foundation

## What was implemented

### 1. Model field + migration
- `backend/src/contexts/identity/infrastructure/django/models.py`: added
  `allowed_spaces = models.JSONField(null=True, blank=True, default=None, ...)`
  to `MembershipModel`.
- `backend/src/contexts/identity/migrations/0011_membershipmodel_allowed_spaces.py`:
  generated via `manage.py makemigrations identity`. Pure `AddField`, no
  backfill needed since `null` is the default and matches "unrestricted".

### 2. Domain layer
- `backend/src/contexts/identity/domain/repositories/workspace_repository.py`:
  - `MemberView` gained `allowed_spaces: list[str] | None = None`.
  - `MembershipRepository` gained abstract `update_allowed_spaces(*, workspace_id, user_id, allowed_spaces)`.

### 3. Django repository implementation
- `backend/src/contexts/identity/infrastructure/django/repositories_impl.py`:
  - `list_members` now includes `allowed_spaces=r.allowed_spaces`.
  - `update_allowed_spaces` implemented as a plain `.update(allowed_spaces=...)`,
    mirroring `update_role`.

### 4. Use case
- `backend/src/contexts/identity/application/use_cases/update_member_spaces.py`
  (`UpdateMemberSpaces`): mirrors `UpdateMemberRole`'s guard shape —
  actor must be owner/admin (`role.can_manage_members`), target must exist
  in the workspace (`NotFoundError` otherwise). Validates `allowed_spaces`
  (when not `None`) only contains `{"boards", "marketing", "comercial"}`,
  raising `ValidationError` otherwise. I did **not** port the
  "actor can't change their own role" self-guard from `UpdateMemberRole` —
  that rule is specific to role changes (an owner demoting themselves could
  orphan a workspace); nothing analogous applies to spaces, so an
  owner/admin restricting their own `allowed_spaces` is allowed (harmless,
  since owner/admin always see everything regardless of the stored value).

### 5. API endpoint
- `backend/src/contexts/identity/interface/api/serializers.py`:
  - `MemberSerializer` gained `allowed_spaces` (list, `allow_null`, not required).
  - `UpdateMemberRoleSerializer`: both `role` and `allowed_spaces` are now
    `required=False` individually, with a `validate()` that requires at
    least one of them to be *present in the raw payload* (checked via
    `self.initial_data`, since DRF's per-field `required` can't express
    "at least one of these fields"). `allowed_spaces` items are validated
    against a `ChoiceField` of the three valid space ids; the field itself
    is `allow_null=True` so an explicit `"allowed_spaces": null` (remove
    restriction) validates correctly.
- `backend/src/contexts/identity/interface/api/workspace_views.py`:
  - `MembersView.get` now includes `allowed_spaces` in the response dict per member.
  - `MemberDetailView.patch` checks `"role" in request.data` and
    `"allowed_spaces" in request.data` independently (not
    `validated_data`, since an absent optional field still resolves falsy
    there) and runs `UpdateMemberRole` / `UpdateMemberSpaces` for whichever
    are present, merging results into one response body
    (`{"user_id", ["role"], ["allowed_spaces"]}`). Role changes still write
    the existing `RoleAuditLog` entry; I did not add a parallel audit trail
    for space changes since the brief didn't ask for one and there's no
    existing audit action type for it — flagging this as a possible gap for
    the security-conscious admin UI, but out of scope here.

### 6. "What can I see" for the current user
Decision: **reused the existing members list**, no new endpoint. `MembersView.get`
(`GET /api/auth/workspaces/<id>/members/`) now returns `user_id`, `role`, and
`allowed_spaces` for every member, including the caller. The frontend's
`MembersTab.tsx` already fetches this list and derives `myRole` by matching
`user_id` against the logged-in user — the exact same pattern trivially
derives "my effective spaces" (role owner/admin → all spaces; role member →
`allowed_spaces` field, `null` → all spaces). A dedicated `/me/membership/`-style
endpoint would only pay for itself if the members list were expensive, admin-only,
or came from a different workspace than the one being rendered — none of which
is true here (it's already a members-of-my-current-workspace fetch, viewable by
any member per `ListMembers`'s own permission check). Adding a second endpoint
would mean two sources of truth for the same field. Left as a note for whoever
builds the frontend consumer, not committed to backend code.

### 7. Shared permission primitive
- `backend/src/contexts/copilot/infrastructure/django/repositories_impl.py`:
  added `DjangoWorkspaceAccess.can_view_space(*, workspace_id, user_id, space)`,
  querying `MembershipModel` directly (role + allowed_spaces in one
  `.values_list(...).first()` call). Owner/admin → `True` unconditionally.
  Non-member → `False`. Member with `allowed_spaces=None` → `True`. Member
  with a list → `space in allowed_spaces` (so `[]` → always `False`).
  I did **not** add this as an abstract method on the base `WorkspaceAccess`
  ABC in `contexts/copilot/domain/repositories/document_repository.py` — the
  brief scoped this to the concrete `DjangoWorkspaceAccess` class only, and
  there's exactly one implementation of that particular ABC, so adding an
  abstract method there wouldn't gain any enforcement, just churn.
- `backend/src/shared/interface/permissions.py` (new file):
  `SpaceAccessPermission(BasePermission)`. Reads `workspace_id` from
  `request.query_params.get("workspace_id") or request.data.get("workspace_id")`,
  reads `required_space = getattr(view, "required_space", None)`.
  - No `required_space` on the view → `True` (opt-in, not default-deny).
  - No `workspace_id` in the request → `True`.
  - User not a member of that workspace → `True`.
  - Otherwise → delegates to `DjangoWorkspaceAccess().can_view_space(...)`.

  **Design choice on the missing-workspace_id / non-member cases**: I chose
  to return `True` (allow) rather than `False` (deny) in both cases, per the
  brief's explicit permission to pick either "as long as it avoids a
  confusing double-error." Reasoning: every existing view in this codebase
  that needs a workspace_id already validates its presence and membership
  itself (see `ListMembers.execute`, `_require_member` patterns in
  `integrations/interface/api/views.py`, `PermissionDeniedError` raises
  across the sales/projects contexts) and raises a domain error with a
  specific, already-covered-by-tests message ("Você não tem acesso a este
  workspace.", "workspace_id obrigatório", etc.), which the shared
  `domain_exception_handler` renders correctly. If `SpaceAccessPermission`
  returned `False` here, DRF's own generic
  `{"detail": "You do not have permission..."}` 403 would fire *first*,
  before the view's own code ever runs — burying the more specific message
  and creating exactly the "confusing double-error" the brief warned about
  (a plain member.request to an endpoint with an unrelated `workspace_id`
  typo would 403 with a generic DRF message about spaces, when the real
  problem is "not a member" or "missing workspace_id"). Since this
  permission class is not wired into any view yet (future task), this only
  matters as a documented contract for whoever adopts it next.

## Test commands run and output

```
cd backend && .venv/bin/pytest src/contexts/identity/ src/shared/ -v
```
50 passed (identity: model/use-case/API tests including the new
`test_update_member_spaces.py`, `test_member_spaces_api.py`; shared:
`test_permissions.py`). Also ran
`src/contexts/copilot/infrastructure/tests/test_workspace_access_spaces.py`
in the same invocation (6 passed) since `can_view_space` lives in the
copilot context, not identity/shared — the task's stated test command
doesn't cover that context's test directory, so I ran it explicitly and
list it here for completeness.

```
cd backend && .venv/bin/python manage.py check
```
`System check identified no issues (0 silenced).`

Also ran the full backend suite (`.venv/bin/pytest src/ -q`) as an extra
sanity check: 686 passed, 4 failed / 17 errors — all in
`src/contexts/chatwoot/tests/test_api.py`, all due to a missing
`CHATWOOT_TOKEN_ENC_KEY` env var in this environment (`RuntimeError:
CHATWOOT_TOKEN_ENC_KEY (ou GOOGLE_TOKEN_ENC_KEY) não configurada...`),
unrelated to this change and pre-existing (confirmed by reading the
traceback — it fails in `chatwoot/infrastructure/django/crypto.py`
before any of my code runs).

## Concerns

- No audit-log entry is written when `allowed_spaces` changes (only role
  changes hit `RoleAuditLog`). If audit coverage matters for this feature,
  that's a follow-up — the `RoleAuditLog.action` choices would need a new
  `"spaces_changed"` value plus old/new-spaces columns (its current
  `old_role`/`new_role` CharFields aren't shaped for JSON lists).
- `SpaceAccessPermission` and `can_view_space` are unused by any view per
  the task's explicit instruction ("do NOT apply it to any view yet") —
  so their real integration behavior (e.g. exact interaction with an
  actual view's own membership checks) is only exercised by the unit
  tests here, not an end-to-end request through a real endpoint.
