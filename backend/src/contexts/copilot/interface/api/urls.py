"""Rotas do contexto copilot."""
from django.urls import path

from contexts.copilot.interface.api.marketing_views import (
    BrandKitView,
    GenerateCampaignView,
    GenerateCopyView,
    RepurposeView,
    SocialAccountsView,
)
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
    WriteAssistView,
)

urlpatterns = [
    path("generate-copy/", GenerateCopyView.as_view(), name="copilot-generate-copy"),
    path(
        "generate-campaign/",
        GenerateCampaignView.as_view(),
        name="copilot-generate-campaign",
    ),
    path("repurpose/", RepurposeView.as_view(), name="copilot-repurpose"),
    path("brand-kit/", BrandKitView.as_view(), name="copilot-brand-kit"),
    path("social-accounts/", SocialAccountsView.as_view(), name="copilot-social-accounts"),
    path("ai-config/", AiConfigView.as_view(), name="ai-config"),
    path("ai-config/test/", AiConfigTestView.as_view(), name="ai-config-test"),
    path("chat/", CopilotChatView.as_view(), name="copilot-chat"),
    path("write-assist/", WriteAssistView.as_view(), name="copilot-write-assist"),
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
