"""Configurações de desenvolvimento."""
from .base import *  # noqa: F401,F403
from .base import DEBUG  # noqa: F401

# Em dev permite qualquer host
ALLOWED_HOSTS = ["*"]

# Emails aparecem no terminal em vez de serem enviados
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Em dev, o cadastro já cria a conta ativa (sem precisar verificar email,
# que aqui só aparece no console). Em prod isto é False.
AUTH_AUTO_ACTIVATE = True
