import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("projects", "0024_alter_notificationmodel_type"),
        ("projects", "0024_anonymous_report"),
    ]

    operations = [
        migrations.CreateModel(
            name="JiraImportLinkModel",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("jira_issue_id", models.CharField(max_length=32)),
                ("jira_key", models.CharField(max_length=32)),
                ("imported_at", models.DateTimeField(auto_now_add=True)),
                ("last_synced_at", models.DateTimeField(auto_now=True)),
                (
                    "card",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="jira_link",
                        to="projects.cardmodel",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="jira_links",
                        to="projects.projectmodel",
                    ),
                ),
            ],
            options={
                "verbose_name": "Vínculo de importação Jira",
                "verbose_name_plural": "Vínculos de importação Jira",
                "db_table": "jira_import_link",
            },
        ),
        migrations.AddConstraint(
            model_name="jiraimportlinkmodel",
            constraint=models.UniqueConstraint(
                fields=("project", "jira_issue_id"), name="uniq_jira_project_issue"
            ),
        ),
    ]
