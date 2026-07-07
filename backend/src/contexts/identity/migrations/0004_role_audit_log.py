"""Migration 0004 — cria a tabela identity_role_audit_log."""
import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("identity", "0003_password_reset"),
    ]

    operations = [
        migrations.CreateModel(
            name="RoleAuditLog",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("actor_id", models.UUIDField(help_text="ID do usuário que realizou a ação")),
                ("target_user_id", models.UUIDField(help_text="ID do usuário afetado")),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("role_changed", "Papel alterado"),
                            ("member_removed", "Membro removido"),
                        ],
                        max_length=20,
                    ),
                ),
                ("old_role", models.CharField(blank=True, default="", max_length=10)),
                ("new_role", models.CharField(blank=True, default="", max_length=10)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="audit_logs",
                        to="identity.workspacemodel",
                    ),
                ),
            ],
            options={
                "verbose_name": "Audit Log",
                "verbose_name_plural": "Audit Logs",
                "db_table": "identity_role_audit_log",
                "ordering": ["-created_at"],
            },
        ),
    ]
