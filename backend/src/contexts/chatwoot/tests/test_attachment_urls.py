"""Testes da normalização de URL de anexo (instância self-hosted sem
active_storage.service_url_options configurado devolve URL relativa)."""
from contexts.chatwoot.domain.entities.conversation import Attachment, Message
from contexts.chatwoot.infrastructure.chatwoot_api import _absolutize, _fix_attachment_urls

ROOT = "https://chatwoot.t4egroup.com.br"


def test_absolutize_mantem_url_ja_absoluta():
    url = "https://cdn.chatwoot.com/file.png"
    assert _absolutize(url, ROOT) == url


def test_absolutize_resolve_url_relativa_com_barra():
    assert (
        _absolutize("/rails/active_storage/blobs/abc/file.png", ROOT)
        == f"{ROOT}/rails/active_storage/blobs/abc/file.png"
    )


def test_absolutize_resolve_url_relativa_sem_barra():
    assert _absolutize("rails/active_storage/x.png", ROOT) == f"{ROOT}/rails/active_storage/x.png"


def test_absolutize_preserva_string_vazia():
    assert _absolutize("", ROOT) == ""


def test_fix_attachment_urls_normaliza_data_url_e_thumb_url_da_mensagem():
    message = Message.from_api(
        {
            "id": 1,
            "attachments": [
                {
                    "id": 10,
                    "file_type": "image",
                    "data_url": "/rails/active_storage/blobs/x/photo.jpg",
                    "thumb_url": "/rails/active_storage/thumb/x/photo.jpg",
                },
                {
                    "id": 11,
                    "file_type": "file",
                    "data_url": "https://already-absolute.example.com/doc.pdf",
                },
            ],
        },
        conversation_id=1,
    )

    _fix_attachment_urls(message, ROOT)

    fixed_image, fixed_doc = message.attachments
    assert fixed_image.data_url == f"{ROOT}/rails/active_storage/blobs/x/photo.jpg"
    assert fixed_image.thumb_url == f"{ROOT}/rails/active_storage/thumb/x/photo.jpg"
    # Já vinha absoluta — precisa sair intacta, sem virar
    # "{ROOT}https://already-absolute...".
    assert fixed_doc.data_url == "https://already-absolute.example.com/doc.pdf"


def test_attachment_from_api_com_campos_ausentes_nao_quebra():
    attachment = Attachment.from_api({"id": 1})
    assert attachment.data_url == ""
    assert attachment.thumb_url == ""
