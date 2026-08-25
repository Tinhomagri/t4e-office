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
    "contexts.presence",
    "contexts.integrations",
    "contexts.traffic",
    "contexts.sales",
    "contexts.chatwoot",
    "contexts.meetings",
    "contexts.jira",
]

# Em ambientes serverless (ex.: Vercel), daphne/channels podem não existir
# porque a função roda WSGI e não precisa de ASGI/WebSocket no processo web.
try:
    import channels  # noqa: F401
    import daphne  # noqa: F401
except ModuleNotFoundError:
    pass
else:
    INSTALLED_APPS = ["daphne", "channels", *INSTALLED_APPS]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
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
STATIC_ROOT = BASE_DIR / "staticfiles"
# WhiteNoise serve o CSS/JS coletado direto do Daphne — sem isto o /admin
# roteava até o Django, mas o arquivo estático em si nunca tinha quem
# devolvesse (404 em produção, sem servidor de estático próprio na frente).
STATICFILES_STORAGE = "whitenoise.storage.CompressedStaticFilesStorage"

# Uploads (anexos de card, avatar de projeto). Sem MEDIA_URL o Django devolve
# em `FileField.url` só o caminho relativo, e a imagem quebra no navegador.
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

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
    # Só a criação de card pelo board público declara `throttle_classes` hoje —
    # é a única rota sem login que aceita upload de arquivo. Rate vive aqui
    # porque o throttle de escopo do DRF exige a taxa no settings, não na view.
    "DEFAULT_THROTTLE_RATES": {
        "public_card_create": "20/hour",
        "traffic_report": "90/min",
        "traffic_thumbnail": "400/min",
        "traffic_preview": "60/min",
    },
}

# Em dev, ativa a conta no cadastro (email vai só pro console). Em prod, False:
# a conta só ativa após verificar o email.
AUTH_AUTO_ACTIVATE = env.bool("AUTH_AUTO_ACTIVATE", default=False)

# Tráfego pago (Meta Ads) — config global por variável de ambiente, sem
# credencial por workspace nesta fase. Sem token/conta, os endpoints
# devolvem ValidationError (400) em vez de tentar falar com a Meta.
META_TRAFFIC_ACCESS_TOKEN = env("META_TRAFFIC_ACCESS_TOKEN", default="")
META_AD_ACCOUNT_ID = env("META_AD_ACCOUNT_ID", default="")
META_GRAPH_VERSION = env("META_GRAPH_VERSION", default="v21.0")
# Planilha de leads (funil): etapa, cidade/UF, utm_content.
TRAFFIC_SHEET_LEADS_URL = env("TRAFFIC_SHEET_LEADS_URL", default="")
# Planilha histórica de leads (telefone, nome, origem, anúncio) — só para a
# conciliação de vendas casar por telefone/nome.
TRAFFIC_SHEET_HIST_URL = env("TRAFFIC_SHEET_HIST_URL", default="")
# Planilha de vendas fechadas (nome, telefone, valor, datas).
TRAFFIC_SHEET_FECHADOS_URL = env("TRAFFIC_SHEET_FECHADOS_URL", default="")

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

# Reuniões nativas: SFU LiveKit self-hosted. A chave/segredo são o par
# compartilhado com o servidor de mídia (backend/livekit.yaml) — é com ele que
# assinamos os tokens de entrada na sala. Os defaults são os de dev, para
# `docker compose up` funcionar sem setup; em produção venham do ambiente.
LIVEKIT_API_KEY = env("LIVEKIT_API_KEY", default="devkey")
LIVEKIT_API_SECRET = env(
    "LIVEKIT_API_SECRET", default="devsecret_troque_em_producao_0123456789abcdef"
)
# URL que o NAVEGADOR usa para falar com o SFU (não a interna do compose).
LIVEKIT_URL = env("LIVEKIT_URL", default="ws://localhost:7880")
# Diferente da de cima: esta é chamada só pelo BACKEND, direto no serviço
# `livekit` da mesma rede docker — nunca passa pelo Traefik/TLS público, então
# não precisa de configuração extra em produção (o serviço se chama "livekit"
# nos dois compose, dev e prod). Usada pra ações administrativas (encerrar
# sessão ao vivo de uma sala), nunca pelo cliente.
LIVEKIT_ADMIN_URL = env("LIVEKIT_ADMIN_URL", default="http://livekit:7880")


# Camada de canais para tempo real (presença, poker). O Redis é o que permite um processo
# difundir para sockets abertos em OUTRO processo — com InMemory, cada worker
# ficaria isolado e a mensagem só chegaria a quem calhasse de estar no mesmo.
#
# Layer pub/sub, não a `core`: a `core` guarda uma fila por canal e lê com
# BRPOP bloqueante, que estoura `TimeoutError` sempre que a conversa fica
# ociosa mais que o socket timeout — o cliente caía e reconectava a cada
# silêncio. Nosso uso é difusão pura (group_send/group_add, sem fila a
# persistir), que é justamente o caso para o qual a pub/sub existe.
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.pubsub.RedisPubSubChannelLayer",
        "CONFIG": {"hosts": [env("REDIS_URL", default="redis://redis:6379/0")]},
    }
}


# Integração Google (OAuth + Calendar)
GOOGLE_OAUTH_CLIENT_ID = env("GOOGLE_OAUTH_CLIENT_ID", default="")
GOOGLE_OAUTH_CLIENT_SECRET = env("GOOGLE_OAUTH_CLIENT_SECRET", default="")
GOOGLE_OAUTH_REDIRECT_URI = env(
    "GOOGLE_OAUTH_REDIRECT_URI",
    default="http://localhost:8000/api/google/callback/",
)
# Redirect separado p/ o fluxo de login/cadastro com Google (sem usuário autenticado
# ainda). Precisa estar cadastrado como "Authorized redirect URI" no Google Cloud tb.
GOOGLE_OAUTH_LOGIN_REDIRECT_URI = env(
    "GOOGLE_OAUTH_LOGIN_REDIRECT_URI",
    default="http://localhost:8000/api/auth/google/callback/",
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

# OAuth das redes sociais (contexto integrations). Crie o app em cada
# plataforma (Meta/LinkedIn/X/TikTok/Google) e preencha as credenciais:
#   SOCIAL_<PROVIDER>_CLIENT_ID / SOCIAL_<PROVIDER>_CLIENT_SECRET
# Redirect registrado no app: <BASE>/api/integrations/oauth/<provider>/callback/
SOCIAL_OAUTH_REDIRECT_BASE = env(
    "SOCIAL_OAUTH_REDIRECT_BASE", default="http://localhost:8000"
)
SOCIAL_INSTAGRAM_CLIENT_ID = env("SOCIAL_INSTAGRAM_CLIENT_ID", default="")
SOCIAL_INSTAGRAM_CLIENT_SECRET = env("SOCIAL_INSTAGRAM_CLIENT_SECRET", default="")
SOCIAL_FACEBOOK_CLIENT_ID = env("SOCIAL_FACEBOOK_CLIENT_ID", default="")
SOCIAL_FACEBOOK_CLIENT_SECRET = env("SOCIAL_FACEBOOK_CLIENT_SECRET", default="")
SOCIAL_LINKEDIN_CLIENT_ID = env("SOCIAL_LINKEDIN_CLIENT_ID", default="")
SOCIAL_LINKEDIN_CLIENT_SECRET = env("SOCIAL_LINKEDIN_CLIENT_SECRET", default="")
SOCIAL_X_CLIENT_ID = env("SOCIAL_X_CLIENT_ID", default="")
SOCIAL_X_CLIENT_SECRET = env("SOCIAL_X_CLIENT_SECRET", default="")
SOCIAL_TIKTOK_CLIENT_ID = env("SOCIAL_TIKTOK_CLIENT_ID", default="")
SOCIAL_TIKTOK_CLIENT_SECRET = env("SOCIAL_TIKTOK_CLIENT_SECRET", default="")
SOCIAL_YOUTUBE_CLIENT_ID = env("SOCIAL_YOUTUBE_CLIENT_ID", default="")
SOCIAL_YOUTUBE_CLIENT_SECRET = env("SOCIAL_YOUTUBE_CLIENT_SECRET", default="")
# Publicação: real via API oficial (padrão). SOCIAL_SIMULATE=True mantém a
# publicação/métricas simuladas para seed e demo sem credenciais reais.
SOCIAL_SIMULATE = env.bool("SOCIAL_SIMULATE", default=False)

# Atendimento (Chatwoot). A instância e o token são por workspace, cadastrados
# na tela Comercial → Atendimento → Conexão; aqui fica só a chave Fernet que
# cifra o token no banco (reaproveita a do Google se vazia).
CHATWOOT_TOKEN_ENC_KEY = env("CHATWOOT_TOKEN_ENC_KEY", default="") or env(
    "GOOGLE_TOKEN_ENC_KEY", default=""
)

# URL pública desta API — usada para montar a URL de webhook que o admin cola
# no Chatwoot. Em dev, aponte para o túnel (ngrok/cloudflared).
PUBLIC_BASE_URL = env("PUBLIC_BASE_URL", default="") or env(
    "SOCIAL_OAUTH_REDIRECT_BASE", default="http://localhost:8000"
)

# Infra real-time/filas — configurada, ativada quando Presença/Poker entrarem
REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")
CELERY_BROKER_URL = REDIS_URL
