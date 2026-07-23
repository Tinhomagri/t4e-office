"""Rotas do contexto sales (prefixo /api/sales/)."""
from django.urls import path

from contexts.sales.interface.api.metrics_views import PipelineMetricsView
from contexts.sales.interface.api.views import (
    ContactDetailView,
    ContactListCreateView,
    CustomerDetailView,
    CustomerListCreateView,
    DealActivityDetailView,
    DealActivityListCreateView,
    DealDetailView,
    DealHistoryView,
    DealListCreateView,
    DealLoseView,
    DealMoveView,
    DealWinView,
    PipelineSummaryView,
    StageDetailView,
    StageListCreateView,
    WorkspaceActivityListView,
)

urlpatterns = [
    # Clientes e contatos
    path("customers/", CustomerListCreateView.as_view(), name="sales-customer-list"),
    path("customers/<uuid:customer_id>/", CustomerDetailView.as_view(), name="sales-customer-detail"),
    path("customers/<uuid:customer_id>/contacts/", ContactListCreateView.as_view(), name="sales-contact-list"),
    path("contacts/<uuid:contact_id>/", ContactDetailView.as_view(), name="sales-contact-detail"),
    # Estágios do funil
    path("stages/", StageListCreateView.as_view(), name="sales-stage-list"),
    path("stages/<uuid:stage_id>/", StageDetailView.as_view(), name="sales-stage-detail"),
    # Negócios
    path("deals/", DealListCreateView.as_view(), name="sales-deal-list"),
    path("deals/<uuid:deal_id>/", DealDetailView.as_view(), name="sales-deal-detail"),
    path("deals/<uuid:deal_id>/move/", DealMoveView.as_view(), name="sales-deal-move"),
    path("deals/<uuid:deal_id>/win/", DealWinView.as_view(), name="sales-deal-win"),
    path("deals/<uuid:deal_id>/lose/", DealLoseView.as_view(), name="sales-deal-lose"),
    path("deals/<uuid:deal_id>/history/", DealHistoryView.as_view(), name="sales-deal-history"),
    path("deals/<uuid:deal_id>/activities/", DealActivityListCreateView.as_view(), name="sales-activity-list"),
    path("activities/", WorkspaceActivityListView.as_view(), name="sales-activity-workspace-list"),
    path("activities/<uuid:activity_id>/", DealActivityDetailView.as_view(), name="sales-activity-detail"),
    # Resumo do funil
    path("pipeline/summary/", PipelineSummaryView.as_view(), name="sales-pipeline-summary"),
    path("pipeline/metrics/", PipelineMetricsView.as_view(), name="sales-pipeline-metrics"),
]
