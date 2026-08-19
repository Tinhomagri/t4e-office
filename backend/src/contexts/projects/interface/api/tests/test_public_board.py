"""Board público: link sem login pra acompanhar o board — espelho read-only,
com a exceção de criar card novo quando o projeto libera.
"""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import (
    AttachmentModel,
    BoardMessageModel,
    CardCommentModel,
    CardModel,
    ProjectModel,
    SprintModel,
    WorkflowStatusModel,
)

# PNG 1x1 mínimo válido — só pra passar pela checagem de mimetype/tamanho.
PNG_1X1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108020000009077"
    "53de0000000c4944415478da6360000000020001e221bc330000000049454e"
    "44ae426082"
)


@pytest.fixture
def cenario(db):
    dono = UserModel.objects.create_user(
        email="dono@t4e.com", password="x", full_name="Ana Dono", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=dono)
    MembershipModel.objects.create(workspace=ws, user=dono, role="owner")
    projeto = ProjectModel.objects.create(
        workspace=ws, name="Projeto Cliente", key="PC", visibility="workspace",
        public_token="tok-123",
    )
    todo = WorkflowStatusModel.objects.create(
        project=projeto, name="A Fazer", slug="todo", category="todo", order=0,
    )
    card = CardModel.objects.create(
        project=projeto, number=1, title="Ajustar layout",
        description="Descrição interna do card", status="todo", assignee=dono,
    )
    CardCommentModel.objects.create(card=card, author=dono, body="Comentário interno")
    return {"dono": dono, "ws": ws, "projeto": projeto, "todo": todo, "card": card}


def _admin(user) -> APIClient:
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_token_invalido_da_404(cenario):
    r = APIClient().get("/api/public/boards/nao-existe/")
    assert r.status_code == 404


@pytest.mark.django_db
def test_board_publico_traz_card_completo_sem_autenticacao(cenario):
    """Anônimo, sem header nenhum — é o ponto: acompanhar sem login."""
    r = APIClient().get("/api/public/boards/tok-123/")
    assert r.status_code == 200
    assert r.data["project"]["key"] == "PC"
    card = r.data["cards"][0]
    assert card["title"] == "Ajustar layout"
    assert card["description"] == "Descrição interna do card"
    assert card["assignee_name"] == "Ana Dono"
    assert card["comments"][0]["body"] == "Comentário interno"


@pytest.mark.django_db
def test_board_publico_mostra_so_sprint_ativa_igual_o_board_interno(cenario):
    """Cópia exata do time: card de sprint fechada/planejada some, card sem
    sprint (backlog) também some quando existe sprint ativa — igual o
    `KanbanView` escolhe sozinho ao abrir (nunca mistura tudo junto)."""
    p = cenario["projeto"]
    ativa = SprintModel.objects.create(project=p, name="Ativa", status="active")
    outra = SprintModel.objects.create(project=p, name="Fechada", status="closed")
    da_ativa = CardModel.objects.create(
        project=p, number=2, title="Da sprint ativa", status="todo", sprint=ativa,
    )
    CardModel.objects.create(
        project=p, number=3, title="De outra sprint", status="todo", sprint=outra,
    )
    # cenario["card"] (number=1) não tem sprint — é backlog, também some.

    r = APIClient().get("/api/public/boards/tok-123/")
    assert r.status_code == 200
    titulos = {c["title"] for c in r.data["cards"]}
    assert titulos == {"Da sprint ativa"}
    assert da_ativa.title in titulos


@pytest.mark.django_db
def test_board_publico_mostra_backlog_quando_nenhuma_sprint_ativa(cenario):
    p = cenario["projeto"]
    fechada = SprintModel.objects.create(project=p, name="Fechada", status="closed")
    CardModel.objects.create(project=p, number=2, title="De sprint fechada", status="todo", sprint=fechada)

    r = APIClient().get("/api/public/boards/tok-123/")
    assert r.status_code == 200
    titulos = {c["title"] for c in r.data["cards"]}
    # cenario["card"] (sem sprint) aparece — é backlog e não há sprint ativa.
    assert cenario["card"].title in titulos
    assert "De sprint fechada" not in titulos


@pytest.mark.django_db
def test_projeto_sem_link_nao_aparece_por_token_vazio(cenario):
    """Token nulo em outro projeto não pode ser alcançável por URL vazia."""
    ProjectModel.objects.create(workspace=cenario["ws"], name="Sem link", key="SL")
    r = APIClient().get("/api/public/boards//")
    assert r.status_code == 404


@pytest.mark.django_db
def test_criar_card_publico_recusado_quando_projeto_nao_libera(cenario):
    r = APIClient().post(
        "/api/public/boards/tok-123/cards/", {"title": "Sugestão"}, format="json"
    )
    assert r.status_code == 403


@pytest.mark.django_db
def test_criar_card_publico_funciona_quando_liberado(cenario):
    cenario["projeto"].public_allow_create = True
    cenario["projeto"].save(update_fields=["public_allow_create"])

    r = APIClient().post(
        "/api/public/boards/tok-123/cards/",
        {"title": "Sugestão do cliente", "description": "Seria bom ter isso"},
        format="json",
    )
    assert r.status_code == 201
    novo = CardModel.objects.get(project=cenario["projeto"], number=2)
    assert novo.title == "Sugestão do cliente"
    assert novo.source == "public_link"
    assert novo.status == "todo"


@pytest.mark.django_db
def test_criar_card_publico_com_flag_de_atencao(cenario):
    """Cliente marca o card como urgente na criação — aura laranja + "!" no
    board (renderização é frontend, aqui só confirma que o dado persiste e
    volta na resposta)."""
    cenario["projeto"].public_allow_create = True
    cenario["projeto"].save(update_fields=["public_allow_create"])

    r = APIClient().post(
        "/api/public/boards/tok-123/cards/",
        {"title": "Urgente", "flagged": True},
        format="json",
    )
    assert r.status_code == 201
    assert r.data["flagged"] is True
    novo = CardModel.objects.get(id=r.data["id"])
    assert novo.flagged is True


@pytest.mark.django_db
def test_criar_card_publico_sem_flag_fica_false(cenario):
    cenario["projeto"].public_allow_create = True
    cenario["projeto"].save(update_fields=["public_allow_create"])

    r = APIClient().post(
        "/api/public/boards/tok-123/cards/", {"title": "Normal"}, format="json"
    )
    assert r.status_code == 201
    assert r.data["flagged"] is False


@pytest.mark.django_db
def test_criar_card_publico_com_imagem_anexa_sem_autor(cenario):
    """Cliente sem conta consegue anexar print/foto junto do card — anexo
    nasce sem autor (author=None), só o time tem conta pra isso."""
    cenario["projeto"].public_allow_create = True
    cenario["projeto"].save(update_fields=["public_allow_create"])

    imagem = SimpleUploadedFile("print.png", PNG_1X1, content_type="image/png")
    r = APIClient().post(
        "/api/public/boards/tok-123/cards/",
        {"title": "Com imagem", "image": imagem},
        format="multipart",
    )
    assert r.status_code == 201
    assert len(r.data["attachments"]) == 1
    assert r.data["attachments"][0]["filename"] == "print.png"

    anexo = AttachmentModel.objects.get(card_id=r.data["id"])
    assert anexo.author_id is None
    assert anexo.mime_type == "image/png"


@pytest.mark.django_db
def test_criar_card_publico_recusa_arquivo_que_nao_e_imagem(cenario):
    cenario["projeto"].public_allow_create = True
    cenario["projeto"].save(update_fields=["public_allow_create"])

    arquivo = SimpleUploadedFile("script.exe", b"conteudo", content_type="application/x-msdownload")
    r = APIClient().post(
        "/api/public/boards/tok-123/cards/",
        {"title": "Com arquivo ruim", "image": arquivo},
        format="multipart",
    )
    assert r.status_code == 400
    assert not CardModel.objects.filter(title="Com arquivo ruim").exists()


@pytest.mark.django_db
def test_criar_card_publico_recusa_imagem_grande_demais(cenario):
    cenario["projeto"].public_allow_create = True
    cenario["projeto"].save(update_fields=["public_allow_create"])

    grande = SimpleUploadedFile(
        "grande.png", b"0" * (8 * 1024 * 1024 + 1), content_type="image/png"
    )
    r = APIClient().post(
        "/api/public/boards/tok-123/cards/",
        {"title": "Imagem grande", "image": grande},
        format="multipart",
    )
    assert r.status_code == 400
    assert not CardModel.objects.filter(title="Imagem grande").exists()


@pytest.mark.django_db
def test_card_criado_pelo_link_publico_entra_no_topo(cenario):
    """Mesma regra do board real: card novo primeiro, não no fim da coluna."""
    cenario["projeto"].public_allow_create = True
    cenario["projeto"].save(update_fields=["public_allow_create"])
    cenario["card"].rank = "m"
    cenario["card"].save(update_fields=["rank"])

    r = APIClient().post(
        "/api/public/boards/tok-123/cards/", {"title": "Card do cliente"}, format="json"
    )
    assert r.status_code == 201
    novo = CardModel.objects.get(id=r.data["id"])
    cenario["card"].refresh_from_db()
    assert novo.rank < cenario["card"].rank


@pytest.mark.django_db
def test_criar_card_publico_nao_altera_card_existente(cenario):
    """A restrição do produto: cria novo, mas nunca mexe no que já existe."""
    cenario["projeto"].public_allow_create = True
    cenario["projeto"].save(update_fields=["public_allow_create"])
    titulo_original = cenario["card"].title

    APIClient().post(
        "/api/public/boards/tok-123/cards/", {"title": "Outro card"}, format="json"
    )

    cenario["card"].refresh_from_db()
    assert cenario["card"].title == titulo_original


@pytest.mark.django_db
def test_admin_gera_e_revoga_o_link(cenario):
    projeto = cenario["projeto"]
    projeto.public_token = None
    projeto.save(update_fields=["public_token"])

    r = _admin(cenario["dono"]).patch(
        f"/api/projects/{projeto.id}/", {"public_token_action": "generate"}, format="json"
    )
    assert r.status_code == 200
    token_gerado = r.data["public_token"]
    assert token_gerado

    r = APIClient().get(f"/api/public/boards/{token_gerado}/")
    assert r.status_code == 200

    r = _admin(cenario["dono"]).patch(
        f"/api/projects/{projeto.id}/", {"public_token_action": "revoke"}, format="json"
    )
    assert r.data["public_token"] is None
    assert APIClient().get(f"/api/public/boards/{token_gerado}/").status_code == 404


@pytest.mark.django_db
def test_mural_leitura_nao_precisa_de_codigo(cenario):
    BoardMessageModel.objects.create(
        project=cenario["projeto"], author_name="Cliente", body="Quando sai a próxima entrega?",
    )
    r = APIClient().get("/api/public/boards/tok-123/messages/")
    assert r.status_code == 200
    assert r.data[0]["body"] == "Quando sai a próxima entrega?"


@pytest.mark.django_db
def test_mural_sem_nome_e_recusado(cenario):
    r = APIClient().post(
        "/api/public/boards/tok-123/messages/",
        {"body": "Lembrete sem nome"},
        format="json",
    )
    assert r.status_code == 400
    assert not BoardMessageModel.objects.filter(project=cenario["projeto"]).exists()


@pytest.mark.django_db
def test_mural_publica_mensagem_sem_codigo_configurado(cenario):
    r = APIClient().post(
        "/api/public/boards/tok-123/messages/",
        {"author_name": "Cliente", "body": "Lembrete: reunião amanhã"},
        format="json",
    )
    assert r.status_code == 201
    msg = BoardMessageModel.objects.get(project=cenario["projeto"])
    assert msg.body == "Lembrete: reunião amanhã"
    assert msg.from_team is False


@pytest.mark.django_db
def test_mural_notifica_owner_e_admin_do_workspace(cenario):
    from contexts.projects.infrastructure.django.models import NotificationModel

    admin = UserModel.objects.create_user(
        email="admin@t4e.com", password="x", full_name="Bruno Admin", is_active=True
    )
    MembershipModel.objects.create(workspace=cenario["ws"], user=admin, role="admin")
    membro_comum = UserModel.objects.create_user(
        email="membro@t4e.com", password="x", full_name="Comum", is_active=True
    )
    MembershipModel.objects.create(workspace=cenario["ws"], user=membro_comum, role="member")

    APIClient().post(
        "/api/public/boards/tok-123/messages/",
        {"author_name": "Cliente", "body": "Oi, tudo bem?"},
        format="json",
    )

    notificados = set(
        NotificationModel.objects.filter(type="board_message").values_list("user_id", flat=True)
    )
    assert notificados == {cenario["dono"].id, admin.id}


@pytest.mark.django_db
def test_board_com_codigo_configurado_exige_codigo(cenario):
    cenario["projeto"].public_access_code = "ABC234"
    cenario["projeto"].save(update_fields=["public_access_code"])

    r = APIClient().get("/api/public/boards/tok-123/")
    assert r.status_code == 401
    assert r.data["code_required"] is True

    r = APIClient().get("/api/public/boards/tok-123/", {"code": "ERRADO"})
    assert r.status_code == 401

    r = APIClient().get("/api/public/boards/tok-123/", {"code": "ABC234"})
    assert r.status_code == 200


@pytest.mark.django_db
def test_board_com_codigo_configurado_tambem_bloqueia_criar_card_e_mural(cenario):
    """Sem checar o código nessas rotas, dava pra pular o popup de entrada e
    mandar direto pra API — o código tem que valer no board inteiro."""
    cenario["projeto"].public_access_code = "ABC234"
    cenario["projeto"].public_allow_create = True
    cenario["projeto"].save(update_fields=["public_access_code", "public_allow_create"])

    r = APIClient().post(
        "/api/public/boards/tok-123/cards/", {"title": "Sugestão"}, format="json"
    )
    assert r.status_code == 401

    r = APIClient().post(
        "/api/public/boards/tok-123/messages/",
        {"author_name": "Cliente", "body": "Oi"},
        format="json",
    )
    assert r.status_code == 401

    r = APIClient().get("/api/public/boards/tok-123/messages/")
    assert r.status_code == 401

    r = APIClient().post(
        "/api/public/boards/tok-123/cards/",
        {"title": "Sugestão", "code": "ABC234"},
        format="json",
    )
    assert r.status_code == 201


@pytest.mark.django_db
def test_admin_gera_codigo_de_acesso_do_board(cenario):
    r = _admin(cenario["dono"]).patch(
        f"/api/projects/{cenario['projeto'].id}/",
        {"public_access_code_action": "generate"},
        format="json",
    )
    assert r.status_code == 200
    codigo = r.data["public_access_code"]
    assert codigo and len(codigo) == 6

    r = APIClient().get("/api/public/boards/tok-123/", {"code": codigo})
    assert r.status_code == 200

    r = _admin(cenario["dono"]).patch(
        f"/api/projects/{cenario['projeto'].id}/",
        {"public_access_code_action": "revoke"},
        format="json",
    )
    assert r.data["public_access_code"] is None
    assert APIClient().get("/api/public/boards/tok-123/").status_code == 200


@pytest.mark.django_db
def test_time_ve_e_responde_mural_pelo_app(cenario):
    r = _admin(cenario["dono"]).post(
        f"/api/projects/{cenario['projeto'].id}/board-messages/",
        {"body": "Já estamos revisando, obrigado!"},
        format="json",
    )
    assert r.status_code == 201
    assert r.data["from_team"] is True
    assert r.data["author_name"] == "Ana Dono"

    r = APIClient().get("/api/public/boards/tok-123/messages/")
    assert any(m["from_team"] for m in r.data)


@pytest.mark.django_db
def test_cliente_nao_escolhe_o_proprio_token(cenario):
    """`public_token` só muda via `public_token_action` — mandar o campo
    direto não pode "roubar" um valor à escolha de quem chama."""
    r = _admin(cenario["dono"]).patch(
        f"/api/projects/{cenario['projeto'].id}/",
        {"public_token": "valor-escolhido-por-mim"},
        format="json",
    )
    assert r.status_code == 200
    cenario["projeto"].refresh_from_db()
    assert cenario["projeto"].public_token == "tok-123"
