"""Rotas do contexto identity."""
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from contexts.identity.interface.api.views import (
    MeView,
    RegisterView,
    WorkspaceCreateView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    # Login: recebe email + password (USERNAME_FIELD=email)
    path("login/", TokenObtainPairView.as_view(), name="login"),
    path("refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("workspaces/", WorkspaceCreateView.as_view(), name="workspace-create"),
]
