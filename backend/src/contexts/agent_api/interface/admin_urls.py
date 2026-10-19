"""Rotas de gestão de chaves (montadas em /api/)."""
from django.urls import path

from contexts.agent_api.interface.admin_views import AgentKeyListCreateView, AgentKeyRevokeView

urlpatterns = [
    path(
        "workspaces/<uuid:workspace_id>/agent-keys/",
        AgentKeyListCreateView.as_view(),
        name="agent-key-list",
    ),
    path(
        "workspaces/<uuid:workspace_id>/agent-keys/<slug:key_id>/",
        AgentKeyRevokeView.as_view(),
        name="agent-key-revoke",
    ),
]
