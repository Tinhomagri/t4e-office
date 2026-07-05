"""Documentos colaborativos do projeto — persistência real no servidor
(substitui o protótipo em localStorage da aba Documentos)."""
import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0015_saved_filters"),
    ]

    operations = [
        migrations.CreateModel(
            name="DocumentModel",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("title", models.CharField(blank=True, default="Sem título", max_length=200)),
                ("content", models.TextField(blank=True, default="")),
                ("created_by", models.UUIDField()),
                ("updated_by", models.UUIDField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="documents",
                        to="projects.projectmodel",
                    ),
                ),
            ],
            options={
                "db_table": "projects_document",
                "ordering": ["-updated_at"],
            },
        ),
    ]
