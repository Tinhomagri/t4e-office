"""Configurações de desenvolvimento."""
from .base import *  # noqa: F401,F403
from .base import DEBUG, EMAIL_HOST_PASSWORD, EMAIL_HOST_USER  # noqa: F401

# Em dev permite qualquer host
ALLOWED_HOSTS = ["*"]

# Email em dev: se houver credencial SMTP no .env, envia de verdade — é a única
# forma de conferir se o HTML sobrevive ao Gmail. Sem credencial, cai no console
# para não travar quem só quer rodar o projeto.
if EMAIL_HOST_USER and EMAIL_HOST_PASSWORD:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Em dev, o cadastro já cria a conta ativa (sem precisar verificar email,
# que aqui só aparece no console). Em prod isto é False.
AUTH_AUTO_ACTIVATE = True
