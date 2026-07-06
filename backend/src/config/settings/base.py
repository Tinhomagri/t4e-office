"""Configurações base — compartilhadas entre dev e prod."""
from datetime import timedelta
from pathlib import Path

import environ

# src/config/settings/base.py -> sobe 3 níveis até a raiz do backend
BASE_DIR = Path(__file__).resolve().parents[3]

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, []),
    CORS_ALLOWED_ORIGINS=(list, []),
    JWT_ACCESS_TTL_MIN=(int, 15),
    JWT_REFRESH_TTL_DAYS=(int, 7),
    EMAIL_HOST=(str, "smtp.gmail.com"),
    EMAIL_PORT=(int, 587),
    EMAIL_USE_TLS=(bool, True),
    EMAIL_HOST_USER=(str, ""),
    EMAIL_HOST_PASSWORD=(str, ""),
    DEFAULT_FROM_EMAIL=(str, "T4E Office <no-reply@t4egroup.com.br>"),
    FRONTEND_URL=(str, "http://localhost:8080"),
    ANTHROPIC_API_KEY=(str, ""),
    ANTHROPIC_MODEL=(str, "claude-opus-4-8"),
    OPENAI_MODEL=(str, "gpt-4o"),
    AI_CONFIG_ENC_KEY=(str, ""),
)
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY", default="insecure-dev-key")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Terceiros
    "rest_framework",
    "rest_framework_simplejwt",
    "drf_spectacular",
    "corsheaders",
    # Bounded contexts
    "contexts.identity",
    "contexts.projects",
    "contexts.copilot",
    "contexts.estimation",
    "contexts.google",
    "contexts.github",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {"default": env.db("DATABASE_URL", default="sqlite:///db.sqlite3")}

# Usuário custom: email como identificador (sem username)
AUTH_USER_MODEL = "identity.UserModel"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "shared.interface.exception_handler.domain_exception_handler",
}

# Em dev, ativa a conta no cadastro (email vai só pro console). Em prod, False:
# a conta só ativa após verificar o email.
AUTH_AUTO_ACTIVATE = env.bool("AUTH_AUTO_ACTIVATE", default=False)

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env("JWT_ACCESS_TTL_MIN")),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env("JWT_REFRESH_TTL_DAYS")),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "T4E Office API",
    "DESCRIPTION": "API da plataforma T4E Office (Pulse)",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")

# Email (Gmail SMTP — grátis, ~500/dia)
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = env("EMAIL_HOST")
EMAIL_PORT = env("EMAIL_PORT")
EMAIL_USE_TLS = env("EMAIL_USE_TLS")
EMAIL_HOST_USER = env("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL")
FRONTEND_URL = env("FRONTEND_URL")

# Copiloto IA — chaves por workspace (BYO key cifrada); estes são defaults/fallback.
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = env("ANTHROPIC_MODEL")
OPENAI_MODEL = env("OPENAI_MODEL")
# Chave Fernet p/ cifrar as API keys de IA por workspace no banco.
# Reaproveita a GOOGLE_TOKEN_ENC_KEY se AI_CONFIG_ENC_KEY não for definida.
AI_CONFIG_ENC_KEY = env("AI_CONFIG_ENC_KEY") or env("GOOGLE_TOKEN_ENC_KEY", default="")

# Integração Google (OAuth + Calendar)
GOOGLE_OAUTH_CLIENT_ID = env("GOOGLE_OAUTH_CLIENT_ID", default="")
GOOGLE_OAUTH_CLIENT_SECRET = env("GOOGLE_OAUTH_CLIENT_SECRET", default="")
GOOGLE_OAUTH_REDIRECT_URI = env(
    "GOOGLE_OAUTH_REDIRECT_URI",
    default="http://localhost:8000/api/google/callback/",
)
# Chave Fernet p/ cifrar tokens Google no banco — gere com:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
GOOGLE_TOKEN_ENC_KEY = env("GOOGLE_TOKEN_ENC_KEY", default="")

# Integração GitHub (OAuth Web Application Flow + webhooks)
GITHUB_OAUTH_CLIENT_ID = env("GITHUB_OAUTH_CLIENT_ID", default="")
GITHUB_OAUTH_CLIENT_SECRET = env("GITHUB_OAUTH_CLIENT_SECRET", default="")
GITHUB_OAUTH_REDIRECT_URI = env(
    "GITHUB_OAUTH_REDIRECT_URI",
    default="http://localhost:8000/api/github/oauth/callback/",
)
# URL pública que o GitHub chama nos eventos (webhook). Em dev, use um túnel
# (ngrok/cloudflared). Vazio = vínculo funciona, mas sem eventos em tempo real.
GITHUB_WEBHOOK_CALLBACK_URL = env("GITHUB_WEBHOOK_CALLBACK_URL", default="")
# Chave Fernet p/ cifrar o token OAuth do GitHub (reaproveita a do Google se vazia).
GITHUB_TOKEN_ENC_KEY = env("GITHUB_TOKEN_ENC_KEY", default="")

# Infra real-time/filas — configurada, ativada quando Presença/Poker entrarem
REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")
CELERY_BROKER_URL = REDIS_URL
