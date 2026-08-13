"""Classifica as salas que já existem.

O campo `kind` nasce com "meeting" para todo mundo. As salas de mídia do
Escritório e do Planning Poker criadas antes disto continuariam, portanto,
aparecendo na lista de Reuniões — que é justamente o incômodo que o campo veio
resolver. O slug diz a origem de cada uma.
"""
from django.db import migrations


def classificar(apps, schema_editor):
    Room = apps.get_model("meetings", "MeetingRoomModel")
    Room.objects.filter(slug__startswith="office-").update(kind="office")
    Room.objects.filter(slug__startswith="poker-").update(kind="poker")


def desclassificar(apps, schema_editor):
    Room = apps.get_model("meetings", "MeetingRoomModel")
    Room.objects.filter(kind__in=("office", "poker")).update(kind="meeting")


class Migration(migrations.Migration):
    dependencies = [("meetings", "0002_room_kind")]

    operations = [migrations.RunPython(classificar, desclassificar)]
