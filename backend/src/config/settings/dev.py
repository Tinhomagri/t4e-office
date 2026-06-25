"""Configurações de desenvolvimento."""
from .base import *  # noqa: F401,F403
from .base import DEBUG  # noqa: F401

# Em dev permite qualquer host
ALLOWED_HOSTS = ["*"]
