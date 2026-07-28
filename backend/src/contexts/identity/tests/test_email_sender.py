"""Testes do disparador de emails transacionais.

O que importa aqui não é o texto bonito, é o que quebra o email na prática: o
link certo, as duas partes (texto + HTML) e a falha de SMTP virando erro
tratado em vez de 500.
"""
import smtplib
from unittest.mock import patch

import pytest
from django.core import mail

from contexts.identity.infrastructure.django.email_sender_impl import DjangoEmailSender
from shared.domain.errors import UpstreamError

# Sem django_db de propósito: o backend locmem não encosta no banco.


@pytest.fixture
def sender(settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    settings.FRONTEND_URL = "https://office.t4e.com.br/"
    settings.DEFAULT_FROM_EMAIL = "T4E Office <no-reply@t4e.com.br>"
    mail.outbox.clear()
    return DjangoEmailSender()


def html_of(message) -> str:
    """Extrai a parte HTML anexada por attach_alternative."""
    return next(body for body, mimetype in message.alternatives if mimetype == "text/html")


class TestPasswordReset:
    def test_envia_texto_e_html_com_o_mesmo_link(self, sender):
        sender.send_password_reset(
            to_email="ana@empresa.com", full_name="Ana", token="tok123"
        )

        assert len(mail.outbox) == 1
        message = mail.outbox[0]
        expected = "https://office.t4e.com.br/reset-password?token=tok123"
        # Se as duas partes divergirem, quem lê em texto puro cai num link morto.
        assert expected in message.body
        assert expected in html_of(message)

    def test_barra_extra_no_FRONTEND_URL_nao_vira_barra_dupla(self, sender, settings):
        settings.FRONTEND_URL = "https://office.t4e.com.br///"
        sender.send_password_reset(to_email="ana@empresa.com", full_name="Ana", token="t")
        assert "com.br/reset-password" in mail.outbox[0].body

    def test_html_e_a_alternativa_e_o_corpo_principal_e_texto(self, sender):
        sender.send_password_reset(to_email="ana@empresa.com", full_name="Ana", token="t")
        message = mail.outbox[0]
        # Corpo principal em texto: cliente que bloqueia HTML ainda lê o email.
        assert message.content_subtype == "plain"
        assert "<html" in html_of(message).lower()

    def test_avisa_a_validade_de_1h(self, sender):
        sender.send_password_reset(to_email="ana@empresa.com", full_name="Ana", token="t")
        assert "1h" in mail.outbox[0].body
        assert "1 hora" in html_of(mail.outbox[0])

    def test_falha_de_smtp_vira_UpstreamError(self, sender):
        # fail_silently=False deixa a exceção subir; sem tradução isso seria 500.
        with patch(
            "django.core.mail.EmailMultiAlternatives.send",
            side_effect=smtplib.SMTPAuthenticationError(535, b"bad creds"),
        ):
            with pytest.raises(UpstreamError):
                sender.send_password_reset(
                    to_email="ana@empresa.com", full_name="Ana", token="t"
                )


class TestInvitation:
    def test_link_de_convite_e_nome_do_workspace(self, sender):
        sender.send_invitation(
            to_email="novo@empresa.com",
            workspace_name="T4E GROUP",
            inviter_name="Wellington",
            token="inv-9",
            role="admin",
        )

        message = mail.outbox[0]
        assert message.to == ["novo@empresa.com"]
        assert "T4E GROUP" in message.subject
        assert "https://office.t4e.com.br/invite?token=inv-9" in message.body
        assert "Wellington" in html_of(message)

    def test_traduz_o_papel_para_portugues(self, sender):
        sender.send_invitation(
            to_email="novo@empresa.com",
            workspace_name="W",
            inviter_name="W",
            token="t",
            role="admin",
        )
        assert "Administrador" in html_of(mail.outbox[0])

    def test_papel_desconhecido_nao_quebra_o_email(self, sender):
        # Papel novo no backend não pode derrubar o convite por KeyError.
        sender.send_invitation(
            to_email="novo@empresa.com",
            workspace_name="W",
            inviter_name="W",
            token="t",
            role="papel-que-nao-existe",
        )
        assert len(mail.outbox) == 1
        assert "Seu acesso" not in mail.outbox[0].body

    def test_diz_qual_email_usar_para_aceitar(self, sender):
        # O aceite exige o mesmo email do convite; sem isso a pessoa erra a conta.
        sender.send_invitation(
            to_email="novo@empresa.com", workspace_name="W", inviter_name="W", token="t"
        )
        assert "novo@empresa.com" in html_of(mail.outbox[0])


class TestVerification:
    def test_link_de_verificacao(self, sender):
        sender.send_verification(to_email="ana@empresa.com", full_name="Ana", token="v1")
        assert "https://office.t4e.com.br/verify-email?token=v1" in mail.outbox[0].body


class TestTemplateRender:
    @pytest.mark.parametrize("kind", ["reset", "invite", "verify"])
    def test_html_comeca_no_doctype(self, sender, kind):
        # `{# #}` do Django é só de uma linha: um comentário multilinha vaza
        # impresso ANTES do DOCTYPE e o cliente de email deixa de renderizar.
        if kind == "reset":
            sender.send_password_reset(to_email="a@b.com", full_name="A", token="t")
        elif kind == "invite":
            sender.send_invitation(
                to_email="a@b.com", workspace_name="W", inviter_name="I", token="t"
            )
        else:
            sender.send_verification(to_email="a@b.com", full_name="A", token="t")

        html = html_of(mail.outbox[0]).lstrip()
        assert html.startswith("<!DOCTYPE html>"), html[:120]
        # Nenhuma tag de template pode ter sobrado no corpo final.
        assert "{%" not in html and "{{" not in html and "{#" not in html


class TestEscaping:
    def test_nome_com_html_nao_injeta_marcacao(self, sender):
        # Nome vem do cadastro do usuário — é entrada não confiável.
        sender.send_password_reset(
            to_email="ana@empresa.com",
            full_name="<script>alert(1)</script>",
            token="t",
        )
        html = html_of(mail.outbox[0])
        assert "<script>" not in html
        assert "&lt;script&gt;" in html
