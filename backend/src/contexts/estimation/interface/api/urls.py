from django.urls import path

from contexts.estimation.interface.api.views import (
    PokerCardsView,
    PokerHeartbeatView,
    PokerJoinView,
    PokerSessionDetailView,
    PokerSessionListCreateView,
    PokerVoteView,
)

urlpatterns = [
    path(
        "workspaces/<str:workspace_id>/poker/",
        PokerSessionListCreateView.as_view(),
        name="poker-list-create",
    ),
    path(
        "poker/<str:session_id>/",
        PokerSessionDetailView.as_view(),
        name="poker-detail",
    ),
    path(
        "poker/<str:session_id>/join/",
        PokerJoinView.as_view(),
        name="poker-join",
    ),
    path(
        "poker/<str:session_id>/heartbeat/",
        PokerHeartbeatView.as_view(),
        name="poker-heartbeat",
    ),
    path(
        "poker/<str:session_id>/vote/",
        PokerVoteView.as_view(),
        name="poker-vote",
    ),
    path(
        "poker/<str:session_id>/cards/",
        PokerCardsView.as_view(),
        name="poker-cards",
    ),
]
