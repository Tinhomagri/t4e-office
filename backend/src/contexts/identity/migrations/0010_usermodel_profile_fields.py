from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("identity", "0009_usermodel_avatar_image")]

    operations = [
        migrations.AddField(model_name="usermodel", name="job_title", field=models.CharField(blank=True, default="", max_length=120)),
        migrations.AddField(model_name="usermodel", name="phone", field=models.CharField(blank=True, default="", max_length=40)),
        migrations.AddField(model_name="usermodel", name="bio", field=models.CharField(blank=True, default="", max_length=500)),
        migrations.AddField(model_name="usermodel", name="location", field=models.CharField(blank=True, default="", max_length=120)),
        migrations.AddField(model_name="usermodel", name="timezone", field=models.CharField(blank=True, default="America/Sao_Paulo", max_length=64)),
        migrations.AddField(model_name="usermodel", name="language", field=models.CharField(blank=True, default="pt-BR", max_length=10)),
        migrations.AddField(model_name="usermodel", name="theme", field=models.CharField(blank=True, default="system", max_length=10)),
        migrations.AddField(model_name="usermodel", name="density", field=models.CharField(blank=True, default="comfortable", max_length=12)),
        migrations.AddField(model_name="usermodel", name="notification_preferences", field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name="usermodel", name="availability", field=models.CharField(blank=True, default="available", max_length=12)),
    ]
