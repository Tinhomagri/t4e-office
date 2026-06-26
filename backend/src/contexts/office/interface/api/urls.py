from django.urls import path

from .views import AvatarProfileView, DeskListView

app_name = "office"

urlpatterns = [
    path("avatar/", AvatarProfileView.as_view(), name="avatar"),
    path("desks/", DeskListView.as_view(), name="desks"),
]
