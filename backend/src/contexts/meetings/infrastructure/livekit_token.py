"""Emissão dos tokens de acesso ao SFU.

O SFU não conhece nossos usuários nem nossas permissões: ele confia num JWT
assinado com o segredo compartilhado. Quem decide *quem pode entrar em qual
sala* é este backend — o token carrega a sala e as permissões já resolvidas,
e o SFU só as aplica.

Usamos PyJWT direto (já presente via simplejwt) em vez do SDK oficial: o token
é um JWT comum com um claim `video`, e o backend roda serverless na Vercel,
onde cada dependência a mais pesa no cold start.
"""
from __future__ import annotations

import time

import httpx
import jwt
from django.conf import settings

# Um token curto basta: ele só é usado no handshake de entrada. Se a pessoa
# ficar 6h na sala, a conexão já estabelecida não cai quando o token expira.
TOKEN_TTL_SECONDS = 6 * 60 * 60


def issue_token(
    *,
    room: str,
    identity: str,
    name: str,
    can_publish: bool = True,
) -> str:
    """Gera o token de entrada numa sala.

    `identity` é o id do nosso usuário: o SFU o usa como chave do participante,
    então é ele que amarra o vídeo na tela à pessoa certa — nunca use algo que
    o cliente possa escolher.
    """
    key = settings.LIVEKIT_API_KEY
    secret = settings.LIVEKIT_API_SECRET
    if not key or not secret:
        raise RuntimeError(
            "LIVEKIT_API_KEY/LIVEKIT_API_SECRET não configurados — "
            "as reuniões não podem emitir token."
        )

    now = int(time.time())
    payload = {
        "iss": key,
        "sub": identity,
        "nbf": now,
        "exp": now + TOKEN_TTL_SECONDS,
        "name": name,
        "video": {
            "room": room,
            "roomJoin": True,
            # Publicar = enviar câmera/microfone/tela. Um espectador entra com
            # can_publish=False e só recebe — é o que separa plateia de mesa
            # numa apresentação para 20+.
            "canPublish": can_publish,
            "canSubscribe": True,
            "canPublishData": True,
        },
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def _admin_token(room: str) -> str:
    """Token curtíssimo (1min) só pra uma chamada administrativa no SFU — nunca
    entra numa sala, então não precisa da validade longa do token de entrada."""
    key = settings.LIVEKIT_API_KEY
    secret = settings.LIVEKIT_API_SECRET
    now = int(time.time())
    payload = {
        "iss": key,
        "sub": key,
        "nbf": now,
        "exp": now + 60,
        # `roomCreate` é o grant que o LiveKit exige pra DeleteRoom (gestão de
        # sala), não `roomAdmin` (que é por-participante numa sala já aberta).
        "video": {"roomCreate": True, "roomAdmin": True, "room": room},
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def _list_token() -> str:
    """Token administrativo sem sala: `roomList` é um grant global."""
    key = settings.LIVEKIT_API_KEY
    secret = settings.LIVEKIT_API_SECRET
    now = int(time.time())
    payload = {
        "iss": key,
        "sub": key,
        "nbf": now,
        "exp": now + 60,
        "video": {"roomList": True},
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def live_room_counts(*, rooms: list[str]) -> dict[str, int] | None:
    """Quantas pessoas o SFU vê em cada sala NESTE instante.

    A fonte da verdade sobre quem está numa chamada é o SFU, não a nossa
    tabela: ela só registra saída quando o cliente avisa, e fechar a aba,
    perder a rede ou o navegador travar nunca avisa. A sala ficava "com 1
    pessoa" para sempre.

    Uma chamada só para a lista inteira — `ListRooms` aceita vários nomes —
    para a listagem não virar N+1 contra o SFU.

    Devolve `None` quando o SFU não respondeu: "não sei" e "sala vazia" são
    respostas diferentes, e quem chama precisa distinguir as duas.
    """
    if not rooms:
        return {}
    try:
        resp = httpx.post(
            f"{settings.LIVEKIT_ADMIN_URL}/twirp/livekit.RoomService/ListRooms",
            json={"names": rooms},
            headers={"Authorization": f"Bearer {_list_token()}"},
            # Conexão com prazo curto: esta chamada entra no caminho de uma
            # listagem que o navegador repete a cada 15s. Com o SFU fora do ar,
            # esperar os 5s cheios só para descobrir isso travaria a tela.
            timeout=httpx.Timeout(5.0, connect=2.0),
        )
        if resp.status_code != 200:
            return None
        payload = resp.json()
    except (httpx.HTTPError, ValueError):
        return None
    # Sala sem sessão ao vivo nem aparece na resposta, então o zero tem que
    # vir daqui, não da ausência.
    counts = {name: 0 for name in rooms}
    for room in payload.get("rooms") or []:
        name = room.get("name")
        if name not in counts:
            continue
        # O Twirp serializa em lowerCamelCase; aceitar os dois evita depender
        # da configuração de JSON do servidor.
        raw = room.get("numParticipants", room.get("num_participants", 0))
        counts[name] = int(raw or 0)
    return counts


def end_live_session(*, room: str) -> None:
    """Derruba TODO MUNDO que está ao vivo na sala agora, sem mexer no nosso
    registro de sala (`MeetingRoomModel`) — pensado pra sala fixa (daily,
    reunião recorrente): a próxima pessoa que entrar cria uma sessão nova no
    SFU do zero, mesma sala, sem precisar recriar nada aqui.

    Chama a API HTTP do LiveKit direto (Twirp) em vez do SDK oficial — mesmo
    motivo do resto do arquivo: uma dependência a menos no cold start.
    """
    token = _admin_token(room)
    resp = httpx.post(
        f"{settings.LIVEKIT_ADMIN_URL}/twirp/livekit.RoomService/DeleteRoom",
        json={"room": room},
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    # 404 do Twirp = sala já não tinha sessão ao vivo (todo mundo já tinha
    # saído sozinho) — não é erro, é exatamente o resultado que queríamos.
    if resp.status_code not in (200, 404):
        resp.raise_for_status()


def remove_participant(*, room: str, identity: str) -> None:
    token = _admin_token(room)
    resp = httpx.post(
        f"{settings.LIVEKIT_ADMIN_URL}/twirp/livekit.RoomService/RemoveParticipant",
        json={"room": room, "identity": identity},
        headers={"Authorization": f"Bearer {token}"}, timeout=10,
    )
    if resp.status_code not in (200, 404):
        resp.raise_for_status()
