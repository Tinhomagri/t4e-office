"""Board Jira parity: filtros salvos (quick filter chips)."""
import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0014_epic_rank_sprint_lifecycle"),
    ]

    operations = [
        migrations.CreateModel(
            name="SavedFilterModel",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("owner_id", models.UUIDField(db_index=True)),
                ("name", models.CharField(max_length=80)),
                ("jql", models.TextField()),
                ("shared", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="saved_filters",
                        to="projects.projectmodel",
                    ),
                ),
            ],
            options={
                "db_table": "projects_saved_filter",
                "ordering": ["created_at"],
            },
        ),
    ]
