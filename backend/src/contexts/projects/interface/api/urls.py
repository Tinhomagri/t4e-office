"""Rotas do contexto projects."""
from django.urls import path

from contexts.projects.interface.api.agile_views import (
    CardChildrenView,
    CardRankView,
    EpicListView,
    SprintCompleteView,
    SprintStartView,
)
from contexts.projects.interface.api.anonymous_report_views import AnonymousReportCreateView
from contexts.projects.interface.api.automation_views import (
    AutomationRuleDetailView,
    AutomationRuleListCreateView,
    AutomationRuleRunView,
    AutomationRunLogView,
)
from contexts.projects.interface.api.board_config_views import (
    BoardConfigView,
    ProjectDetailView,
    WorkflowStatusReorderView,
)
from contexts.projects.interface.api.card_views import (
    CardCommentView,
    CardDetailView,
    CardHistoryView,
    CardListCreateView,
)
from contexts.projects.interface.api.extra_views import (
    AttachmentDetailView,
    AttachmentListCreateView,
    CardComponentView,
    CardVersionView,
    ComponentDetailView,
    ComponentListCreateView,
    CustomFieldDetailView,
    CustomFieldListCreateView,
    DocumentDetailView,
    DocumentListCreateView,
    IssueFieldValueView,
    ProjectActivityView,
    SavedFilterDetailView,
    SavedFilterListCreateView,
    VersionDetailView,
    VersionListCreateView,
    WorkflowStatusDetailView,
    WorkflowStatusListCreateView,
    WorklogDetailView,
    WorklogListCreateView,
)
from contexts.projects.interface.api.link_views import (
    CardLinkListCreateView,
    IssueLinkDetailView,
)
from contexts.projects.interface.api.marketing_views import (
    AttachmentVersionView,
    CardApprovalView,
    CardMetricView,
    MarketingAssetsView,
    MarketingReportView,
)
from contexts.projects.interface.api.notification_views import (
    NotificationDetailView,
    NotificationListView,
    NotificationReadAllView,
    NotificationStreamView,
)
from contexts.projects.interface.api.permission_scheme_views import (
    ProjectAccessView,
    ProjectPermissionSchemeView,
)
from contexts.projects.interface.api.permission_views import MyProjectPermissionsView
from contexts.projects.interface.api.reports_views import ProjectReportsView
from contexts.projects.interface.api.sprint_views import (
    SprintDetailView,
    SprintListCreateView,
)
from contexts.projects.interface.api.views import ProjectListCreateView

urlpatterns = [
    path("anonymous-reports/", AnonymousReportCreateView.as_view(), name="anonymous-report-create"),
    path("projects/", ProjectListCreateView.as_view(), name="project-list-create"),
    # Configuração de quadro/projeto (aba Geral + swimlanes/layout/cores)
    path("projects/<uuid:project_id>/", ProjectDetailView.as_view(), name="project-detail"),
    path(
        "projects/<uuid:project_id>/board-config/",
        BoardConfigView.as_view(),
        name="board-config",
    ),
    path(
        "projects/<uuid:project_id>/workflow-statuses/reorder/",
        WorkflowStatusReorderView.as_view(),
        name="workflow-status-reorder",
    ),
    path(
        "projects/<uuid:project_id>/cards/",
        CardListCreateView.as_view(),
        name="card-list-create",
    ),
    path("cards/<uuid:card_id>/", CardDetailView.as_view(), name="card-detail"),
    path(
        "cards/<uuid:card_id>/comments/",
        CardCommentView.as_view(),
        name="card-comments",
    ),
    path(
        "cards/<uuid:card_id>/links/",
        CardLinkListCreateView.as_view(),
        name="card-links",
    ),
    path("links/<uuid:link_id>/", IssueLinkDetailView.as_view(), name="link-detail"),
    path(
        "cards/<uuid:card_id>/history/",
        CardHistoryView.as_view(),
        name="card-history",
    ),
    path(
        "projects/<uuid:project_id>/sprints/",
        SprintListCreateView.as_view(),
        name="sprint-list-create",
    ),
    path("sprints/<uuid:sprint_id>/", SprintDetailView.as_view(), name="sprint-detail"),
    path("sprints/<uuid:sprint_id>/start/", SprintStartView.as_view(), name="sprint-start"),
    path("sprints/<uuid:sprint_id>/complete/", SprintCompleteView.as_view(), name="sprint-complete"),
    path("projects/<uuid:project_id>/epics/", EpicListView.as_view(), name="epic-list"),
    path("cards/<uuid:card_id>/rank/", CardRankView.as_view(), name="card-rank"),
    path("cards/<uuid:card_id>/children/", CardChildrenView.as_view(), name="card-children"),
    path("projects/<uuid:project_id>/reports/", ProjectReportsView.as_view(), name="project-reports"),
    path("projects/<uuid:project_id>/my-permissions/", MyProjectPermissionsView.as_view(), name="my-permissions"),
    path(
        "projects/<uuid:project_id>/access/",
        ProjectAccessView.as_view(),
        name="project-access",
    ),
    path(
        "projects/<uuid:project_id>/permission-scheme/",
        ProjectPermissionSchemeView.as_view(),
        name="permission-scheme",
    ),
    # Versions
    path("projects/<uuid:project_id>/versions/", VersionListCreateView.as_view(), name="version-list"),
    path("versions/<uuid:version_id>/", VersionDetailView.as_view(), name="version-detail"),
    path("cards/<uuid:card_id>/versions/", CardVersionView.as_view(), name="card-versions"),
    # Components
    path("projects/<uuid:project_id>/components/", ComponentListCreateView.as_view(), name="component-list"),
    path("components/<uuid:component_id>/", ComponentDetailView.as_view(), name="component-detail"),
    path("cards/<uuid:card_id>/components/", CardComponentView.as_view(), name="card-components"),
    # Worklogs
    path("cards/<uuid:card_id>/worklogs/", WorklogListCreateView.as_view(), name="worklog-list"),
    path("worklogs/<uuid:worklog_id>/", WorklogDetailView.as_view(), name="worklog-detail"),
    # Attachments
    path("cards/<uuid:card_id>/attachments/", AttachmentListCreateView.as_view(), name="attachment-list"),
    path("attachments/<uuid:attachment_id>/", AttachmentDetailView.as_view(), name="attachment-detail"),
    # Marketing: aprovação de peças e versões de anexo
    path("cards/<uuid:card_id>/approval/", CardApprovalView.as_view(), name="card-approval"),
    path("cards/<uuid:card_id>/metrics/", CardMetricView.as_view(), name="card-metrics"),
    path("attachments/<uuid:attachment_id>/versions/", AttachmentVersionView.as_view(), name="attachment-versions"),
    path("projects/<uuid:project_id>/marketing-report/", MarketingReportView.as_view(), name="marketing-report"),
    path("projects/<uuid:project_id>/marketing-assets/", MarketingAssetsView.as_view(), name="marketing-assets"),
    # CustomFields
    path("projects/<uuid:project_id>/custom-fields/", CustomFieldListCreateView.as_view(), name="custom-field-list"),
    path("custom-fields/<uuid:field_id>/", CustomFieldDetailView.as_view(), name="custom-field-detail"),
    path("cards/<uuid:card_id>/field-values/", IssueFieldValueView.as_view(), name="field-values"),
    # Workflow statuses
    path("projects/<uuid:project_id>/workflow-statuses/", WorkflowStatusListCreateView.as_view(), name="workflow-status-list"),
    path("workflow-statuses/<uuid:status_id>/", WorkflowStatusDetailView.as_view(), name="workflow-status-detail"),
    # Saved filters (quick filters do board)
    path("projects/<uuid:project_id>/saved-filters/", SavedFilterListCreateView.as_view(), name="saved-filter-list"),
    path("saved-filters/<uuid:filter_id>/", SavedFilterDetailView.as_view(), name="saved-filter-detail"),
    # Documents (aba Documentos)
    path("projects/<uuid:project_id>/documents/", DocumentListCreateView.as_view(), name="document-list"),
    path("documents/<uuid:document_id>/", DocumentDetailView.as_view(), name="document-detail"),
    # Activity feed (aba Resumo)
    path("projects/<uuid:project_id>/activity/", ProjectActivityView.as_view(), name="project-activity"),
    # Notifications
    path("notifications/", NotificationListView.as_view(), name="notification-list"),
    path("notifications/stream/", NotificationStreamView.as_view(), name="notification-stream"),
    path("notifications/read-all/", NotificationReadAllView.as_view(), name="notification-read-all"),
    path("notifications/<uuid:notification_id>/", NotificationDetailView.as_view(), name="notification-detail"),
    # Automations
    path("projects/<uuid:project_id>/automation-rules/", AutomationRuleListCreateView.as_view(), name="automation-rule-list"),
    path("automation-rules/<uuid:rule_id>/", AutomationRuleDetailView.as_view(), name="automation-rule-detail"),
    path("automation-rules/<uuid:rule_id>/run/", AutomationRuleRunView.as_view(), name="automation-rule-run"),
    path("automation-rules/<uuid:rule_id>/logs/", AutomationRunLogView.as_view(), name="automation-run-logs"),
]
