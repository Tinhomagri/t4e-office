from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0035_alter_notificationmodel_type"),
    ]

    operations = [
        migrations.RenameField(
            model_name="projectmodel",
            old_name="public_message_code",
            new_name="public_access_code",
        ),
    ]
