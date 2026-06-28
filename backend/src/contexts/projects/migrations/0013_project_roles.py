import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0012_notifications"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProjectRoleModel",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=80)),
                ("slug", models.CharField(help_text="admin | developer | viewer | custom", max_length=40)),
                ("is_default", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="roles",
                        to="projects.projectmodel",
                    ),
                ),
            ],
            options={
                "db_table": "projects_project_role",
                "ordering": ["name"],
                "unique_together": {("project", "slug")},
            },
        ),
        migrations.CreateModel(
            name="ProjectRoleMemberModel",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("user_id", models.UUIDField(db_index=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "role",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="members",
                        to="projects.projectrolemodel",
                    ),
                ),
            ],
            options={
                "db_table": "projects_project_role_member",
                "unique_together": {("role", "user_id")},
            },
        ),
    ]
