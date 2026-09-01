"""Rotas do contexto identity."""
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView

from contexts.identity.interface.api.oauth_views import (
    OAuthAuthorizeCodeView,
    OAuthClientDetailView,
    OAuthClientRegisterView,
    OAuthRevokeByValueView,
    OAuthTokenExchangeView,
)
from contexts.identity.interface.api.views import (
    ChangePasswordView,
    ForgotPasswordView,
    GoogleLoginCallbackView,
    GoogleLoginUrlView,
    MeView,
    PersonalAccessTokenListCreateView,
    PersonalAccessTokenRevokeView,
    RegisterView,
    ResetPasswordView,
    TokenRefreshSafeView,
    VerifyEmailView,
    WorkspaceCreateView,
)
from contexts.identity.interface.api.workspace_views import (
    AcceptInvitationView,
    AuditLogView,
    InvitationListCreateView,
    InvitationPreviewView,
    MemberDetailView,
    MembersView,
    RevokeInvitationView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("verify-email/", VerifyEmailView.as_view(), name="verify-email"),
    path("forgot-password/", ForgotPasswordView.as_view(), name="forgot-password"),
    path("reset-password/", ResetPasswordView.as_view(), name="reset-password"),
    # Login: recebe email + password (USERNAME_FIELD=email)
    path("login/", TokenObtainPairView.as_view(), name="login"),
    path("refresh/", TokenRefreshSafeView.as_view(), name="token-refresh"),
    # Login/cadastro via Google: sem senha, email já verificado pelo Google.
    path("google/login-url/", GoogleLoginUrlView.as_view(), name="google-login-url"),
    path(
        "google/callback/",
        GoogleLoginCallbackView.as_view(),
        name="google-login-callback",
    ),
    path("me/", MeView.as_view(), name="me"),
    path("me/change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("tokens/", PersonalAccessTokenListCreateView.as_view(), name="personal-token-list-create"),
    path("tokens/<uuid:token_id>/", PersonalAccessTokenRevokeView.as_view(), name="personal-token-revoke"),
    path("workspaces/", WorkspaceCreateView.as_view(), name="workspace-list-create"),
    path(
        "workspaces/<uuid:workspace_id>/members/",
        MembersView.as_view(),
        name="workspace-members",
    ),
    path(
        "workspaces/<uuid:workspace_id>/members/<uuid:user_id>/",
        MemberDetailView.as_view(),
        name="workspace-member-detail",
    ),
    path(
        "workspaces/<uuid:workspace_id>/invitations/",
        InvitationListCreateView.as_view(),
        name="workspace-invitations",
    ),
    path(
        "workspaces/<uuid:workspace_id>/audit-log/",
        AuditLogView.as_view(),
        name="workspace-audit-log",
    ),
    path(
        "invitations/preview/",
        InvitationPreviewView.as_view(),
        name="invitation-preview",
    ),
    path(
        "invitations/accept/",
        AcceptInvitationView.as_view(),
        name="invitation-accept",
    ),
    path(
        "invitations/<uuid:invitation_id>/revoke/",
        RevokeInvitationView.as_view(),
        name="invitation-revoke",
    ),
]

# Conector MCP (claude.ai Connectors) — fluxo OAuth em proxy pro PAT.
#
# Lista separada (não misturada em `urlpatterns` acima) porque o restante
# deste arquivo é montado em config/urls.py sob o prefixo "api/auth/", mas o
# contrato do conector (spec 2026-09-01-mcp-oauth-connector-design.md) exige
# os 5 endpoints exatamente em "/api/oauth/..." — sem o "auth/" no meio.
# config/urls.py inclui esta lista por fora, com `path("api/", include(...))`.
oauth_urlpatterns = [
    path("oauth/clients/", OAuthClientRegisterView.as_view(), name="oauth-client-register"),
    path(
        "oauth/clients/<str:client_id>/",
        OAuthClientDetailView.as_view(),
        name="oauth-client-detail",
    ),
    path("oauth/authorize-code/", OAuthAuthorizeCodeView.as_view(), name="oauth-authorize-code"),
    path("oauth/token-exchange/", OAuthTokenExchangeView.as_view(), name="oauth-token-exchange"),
    path("oauth/revoke-by-value/", OAuthRevokeByValueView.as_view(), name="oauth-revoke-by-value"),
]
