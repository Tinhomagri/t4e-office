"""Rotas do contexto copilot."""
from django.urls import path

from contexts.copilot.interface.api.marketing_views import GenerateCopyView
from contexts.copilot.interface.api.views import (
    AgentExecuteView,
    AiConfigTestView,
    AiConfigView,
    CopilotChatView,
    CopilotFeedbackView,
    CopilotMetricsView,
    DocumentAnalyzeView,
    DocumentCreateTasksView,
    DocumentListCreateView,
)

urlpatterns = [
    path("generate-copy/", GenerateCopyView.as_view(), name="copilot-generate-copy"),
    path("ai-config/", AiConfigView.as_view(), name="ai-config"),
    path("ai-config/test/", AiConfigTestView.as_view(), name="ai-config-test"),
    path("chat/", CopilotChatView.as_view(), name="copilot-chat"),
    path("agent/execute/", AgentExecuteView.as_view(), name="copilot-agent-execute"),
    path("metrics/", CopilotMetricsView.as_view(), name="copilot-metrics"),
    path("feedback/", CopilotFeedbackView.as_view(), name="copilot-feedback"),
    path("documents/", DocumentListCreateView.as_view(), name="document-list-create"),
    path(
        "documents/<uuid:document_id>/analyze/",
        DocumentAnalyzeView.as_view(),
        name="document-analyze",
    ),
    path(
        "documents/<uuid:document_id>/create-tasks/",
        DocumentCreateTasksView.as_view(),
        name="document-create-tasks",
    ),
]
