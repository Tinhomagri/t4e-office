"""Configurações de teste.

Existe por um motivo específico: `pytest` rodava com `config.settings.dev`, que
resolve `DATABASE_URL` do `.env.local`. Como esse arquivo aponta para o Postgres
de produção (Neon), rodar a suíte local abria conexão lá e tentava criar o banco
`test_neondb` no servidor de produção:

    psycopg.errors.DuplicateDatabase: database "test_neondb" already exists
    psycopg.errors.ObjectInUse: database "test_neondb" is being accessed by other users

Os dados de produção nunca correram risco — o Django cria um banco de teste
separado e não escreve no principal. Mas a suíte ficava presa em rede, um teste
interrompido deixava banco órfão no Neon, e bastava alguém sem o `.env.local`
para ter comportamento diferente do colega.

Aqui o banco é fixado em SQLite em memória, sem ler ambiente nenhum: a suíte não
tem como sair da máquina, roda em segundos e dá o mesmo resultado para todo mundo.
"""
from .base import *  # noqa: F401,F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

ALLOWED_HOSTS = ["*"]
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
AUTH_AUTO_ACTIVATE = True

# Hash barato: o padrão do Django é deliberadamente lento, e a suíte cria
# usuário em quase todo teste de API.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
