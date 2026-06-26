from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.office.infrastructure.django.models import AvatarProfileModel, DeskModel
from contexts.office.interface.api.serializers import AvatarProfileSerializer, DeskSerializer


class AvatarProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_or_create_profile(self, user):
        profile, _ = AvatarProfileModel.objects.get_or_create(user=user)
        return profile

    def get(self, request: Request) -> Response:
        profile = self._get_or_create_profile(request.user)
        return Response(AvatarProfileSerializer(profile).data)

    def patch(self, request: Request) -> Response:
        profile = self._get_or_create_profile(request.user)
        serializer = AvatarProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class DeskListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        desks = DeskModel.objects.select_related("owner").all()
        return Response(DeskSerializer(desks, many=True).data)
