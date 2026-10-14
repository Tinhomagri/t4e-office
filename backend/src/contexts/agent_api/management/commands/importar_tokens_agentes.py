"""Importa o arquivo de hashes de tokens de agente enviado pelo Leonardo.

    python manage.py importar_tokens_agentes agentes.json --workspace t4e
"""
import json

from django.core.management.base import BaseCommand, CommandError

from contexts.agent_api.application.tokens import import_agents
from contexts.identity.infrastructure.django.models import WorkspaceModel


class Command(BaseCommand):
    help = "Cria/atualiza tokens de agente a partir de um JSON {agents: [...]}."

    def add_arguments(self, parser):
        parser.add_argument("arquivo")
        parser.add_argument("--workspace", required=True, help="slug do workspace")

    def handle(self, *args, arquivo, workspace, **options):
        ws = WorkspaceModel.objects.filter(slug=workspace).first()
        if ws is None:
            raise CommandError(f"Workspace '{workspace}' não existe.")
        with open(arquivo, encoding="utf-8") as f:
            data = json.load(f)
        created, updated = import_agents(data, ws)
        self.stdout.write(self.style.SUCCESS(f"{created} criados, {updated} atualizados."))
