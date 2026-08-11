"""Canal público de denúncias anônimas."""
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.infrastructure.django.models import AnonymousReportModel
from contexts.projects.interface.api.serializers import CreateAnonymousReportSerializer


class AnonymousReportCreateView(APIView):
    """Recebe somente o conteúdo da denúncia, sem autenticação ou metadados."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = CreateAnonymousReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        AnonymousReportModel.objects.create(**serializer.validated_data)
        # Não retornar id ou horário evita criar um identificador de rastreio.
        return Response({"message": "Denúncia recebida."}, status=status.HTTP_201_CREATED)
