"""Rotas do contexto identity."""
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from contexts.identity.interface.api.views import (
    ForgotPasswordView,
    GoogleLoginCallbackView,
    GoogleLoginUrlView,
    MeView,
    RegisterView,
    ResetPasswordView,
    VerifyEmailView,
    WorkspaceCreateView,
)
from contexts.identity.interface.api.workspace_views import (
    AcceptInvitationView,
    AuditLogView,
    InvitationListCreateView,
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
    path("refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    # Login/cadastro via Google: sem senha, email já verificado pelo Google.
    path("google/login-url/", GoogleLoginUrlView.as_view(), name="google-login-url"),
    path(
        "google/callback/",
        GoogleLoginCallbackView.as_view(),
        name="google-login-callback",
    ),
    path("me/", MeView.as_view(), name="me"),
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
