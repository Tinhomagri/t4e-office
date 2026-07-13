"""Vercel Python entrypoint — expõe a app WSGI do Django.

Root Directory do projeto Vercel = backend/. O código Django vive em
backend/src, então adicionamos esse diretório ao sys.path antes de importar.
"""
import os
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

from django.core.wsgi import get_wsgi_application  # noqa: E402

app = get_wsgi_application()
