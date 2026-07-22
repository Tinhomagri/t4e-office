"""Publicação REAL nas redes sociais + coleta de métricas reais.

Substitui a simulação antiga. Cada provider segue a API oficial de publicação
de conteúdo (jul/2026):

* Instagram — Content Publishing API (container → publish):
  POST graph.instagram.com/{ig-id}/media  → creation_id
  GET  graph.instagram.com/{creation_id}?fields=status_code  (poll FINISHED)
  POST graph.instagram.com/{ig-id}/media_publish
  Insights: GET /{media-id}/insights?metric=reach,likes,comments,shares,saved
  Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing

* Facebook Page — Graph API (Page Access Token):
  Texto: POST graph.facebook.com/{page-id}/feed  {message,link?}
  Imagem: POST graph.facebook.com/{page-id}/photos {url,caption}
  Insights: GET /{post-id}/insights?metric=post_impressions,post_clicks
  Docs: https://developers.facebook.com/docs/pages-api/posts

* LinkedIn — Posts API (/rest/posts, versionada):
  Imagem: POST /rest/images?action=initializeUpload → upload bytes → urn
  POST /rest/posts {author, commentary, content?}
  Docs: https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api

* X — API v2:
  Mídia: POST api.x.com/2/media/upload (INIT/APPEND/FINALIZE)
  POST api.x.com/2/tweets {text, media?}
  Métricas: GET /2/tweets/{id}?tweet.fields=public_metrics
  Docs: https://docs.x.com/x-api/posts/create-post

* TikTok — Content Posting API (Direct Post, vídeo):
  POST open.tiktokapis.com/v2/post/publish/video/init/ (PULL_FROM_URL)
  poll /v2/post/publish/status/fetch/
  Docs: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post

* YouTube — Data API v3 videos.insert (resumable upload):
  Docs: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol

Design:
* `publish_post(post)` decifra o token da conta e dispara conforme o canal;
  retorna {"external_id": ...}. Levanta `PublishError` em caso de falha, com
  mensagem legível — a view salva em `post.error` e marca status="failed".
* `collect_metrics(post)` busca insights reais; campos ausentes viram 0
  (nunca inventa números). Retorna {impressions,likes,comments,shares,clicks}.
* Sem token válido na conta → `PublishError` clara pedindo (re)conexão OAuth.
"""
from __future__ import annotations

import json
import time

import httpx
from django.utils import timezone

from contexts.copilot.infrastructure.django.models import SocialAccountModel
from contexts.github.infrastructure.django.crypto import decrypt

# Versões de API fixadas (evita quebra silenciosa quando o provider avança).
FB_GRAPH_VERSION = "v25.0"
IG_GRAPH_VERSION = "v23.0"
LINKEDIN_VERSION = "202506"  # header LinkedIn-Version (YYYYMM)

_ZERO_METRICS = {"impressions": 0, "likes": 0, "comments": 0, "shares": 0, "clicks": 0}


class PublishError(Exception):
    """Falha ao publicar/coletar — mensagem já legível para o usuário."""


def _media_list(post) -> list[str]:
    """URLs de mídia do post: carrossel (media_urls) ou a única (media_url)."""
    urls = [u for u in (getattr(post, "media_urls", None) or []) if u]
    if urls:
        return urls
    return [post.media_url] if post.media_url else []


def _caption(post) -> str:
    """Texto final: conteúdo + @menções ainda não presentes no texto."""
    text = post.content or ""
    mentions = [m.lstrip("@").strip() for m in (getattr(post, "mentions", None) or []) if m.strip()]
    extra = [f"@{m}" for m in mentions if f"@{m}" not in text]
    if extra:
        text = f"{text}\n\n{' '.join(extra)}".strip()
    return text


def _is_video(url: str) -> bool:
    return url.lower().split("?")[0].endswith((".mp4", ".mov", ".m4v"))


def _token(account: SocialAccountModel) -> str:
    token = decrypt(account.access_token_encrypted)
    if not token:
        raise PublishError(
            f"Conta {account.channel} sem token válido. Reconecte em "
            f"Marketing → Redes sociais."
        )
    if account.token_expires_at and account.token_expires_at < timezone.now():
        raise PublishError(
            f"Token da conta {account.channel} expirou. Reconecte a conta."
        )
    return token


def _raise_http(provider: str, resp: httpx.Response) -> None:
    """Extrai a mensagem de erro do provider e levanta PublishError."""
    detail = ""
    try:
        body = resp.json()
        detail = (
            (body.get("error") or {}).get("message")  # Meta
            or body.get("error_description")  # OAuth padrão
            or body.get("detail")  # X / LinkedIn
            or body.get("message")
            or str(body)
        )
    except Exception:
        detail = resp.text[:300]
    raise PublishError(f"{provider}: {resp.status_code} — {detail}")


def _download(url: str) -> tuple[bytes, str]:
    """Baixa a mídia hospedada (media_url) para upload binário. (bytes, mime)."""
    if not url:
        raise PublishError("Este canal exige mídia; informe a media_url do post.")
    try:
        r = httpx.get(url, timeout=60, follow_redirects=True)
        r.raise_for_status()
    except httpx.HTTPError as exc:
        raise PublishError(f"Não consegui baixar a mídia ({url}): {exc}") from exc
    return r.content, r.headers.get("content-type", "application/octet-stream")


# --------------------------------------------------------------------------- #
# Instagram
# --------------------------------------------------------------------------- #
def _ig_create_container(base: str, ig_id: str, token: str, params: dict) -> str:
    r = httpx.post(f"{base}/{ig_id}/media", data={**params, "access_token": token}, timeout=30)
    if r.status_code >= 400:
        _raise_http("Instagram", r)
    cid = r.json().get("id")
    if not cid:
        raise PublishError("Instagram não retornou creation_id do container.")
    return cid


def _ig_wait_finished(base: str, container_id: str, token: str) -> None:
    """Aguarda o container ficar FINISHED (vídeos levam alguns segundos)."""
    for _ in range(20):
        s = httpx.get(
            f"{base}/{container_id}",
            params={"fields": "status_code", "access_token": token},
            timeout=20,
        )
        code = s.json().get("status_code") if s.status_code < 400 else None
        if code == "FINISHED":
            return
        if code == "ERROR":
            raise PublishError("Instagram falhou ao processar a mídia do container.")
        time.sleep(3)


def _publish_instagram(post, account, token) -> str:
    media = _media_list(post)
    if not media:
        raise PublishError("Instagram exige ao menos uma imagem/vídeo.")
    base = f"https://graph.instagram.com/{IG_GRAPH_VERSION}"
    ig_id = account.external_id
    caption = _caption(post)

    if len(media) == 1:
        url = media[0]
        params = {"caption": caption}
        if _is_video(url):
            params["media_type"], params["video_url"] = "REELS", url
        else:
            params["image_url"] = url
        container_id = _ig_create_container(base, ig_id, token, params)
    else:
        # Carrossel: um container-filho por mídia, depois o container-pai.
        child_ids = []
        for url in media[:10]:  # IG permite até 10 itens
            child_params = {"is_carousel_item": "true"}
            if _is_video(url):
                child_params["media_type"], child_params["video_url"] = "VIDEO", url
            else:
                child_params["image_url"] = url
            cid = _ig_create_container(base, ig_id, token, child_params)
            _ig_wait_finished(base, cid, token)
            child_ids.append(cid)
        container_id = _ig_create_container(
            base,
            ig_id,
            token,
            {"media_type": "CAROUSEL", "caption": caption, "children": ",".join(child_ids)},
        )

    _ig_wait_finished(base, container_id, token)
    pub = httpx.post(
        f"{base}/{ig_id}/media_publish",
        data={"creation_id": container_id, "access_token": token},
        timeout=30,
    )
    if pub.status_code >= 400:
        _raise_http("Instagram", pub)
    return str(pub.json().get("id", ""))


def _metrics_instagram(post, account, token) -> dict:
    if not post.external_id:
        return dict(_ZERO_METRICS)
    r = httpx.get(
        f"https://graph.instagram.com/{IG_GRAPH_VERSION}/{post.external_id}/insights",
        params={"metric": "reach,likes,comments,shares,saved", "access_token": token},
        timeout=20,
    )
    if r.status_code >= 400:
        return dict(_ZERO_METRICS)
    values = {d["name"]: (d.get("values") or [{}])[0].get("value", 0) for d in r.json().get("data", [])}
    return {
        "impressions": values.get("reach", 0),
        "likes": values.get("likes", 0),
        "comments": values.get("comments", 0),
        "shares": values.get("shares", 0),
        "clicks": values.get("saved", 0),  # IG não expõe clicks; usamos saves
    }


# --------------------------------------------------------------------------- #
# Facebook Page
# --------------------------------------------------------------------------- #
def _publish_facebook(post, account, token) -> str:
    base = f"https://graph.facebook.com/{FB_GRAPH_VERSION}/{account.external_id}"
    caption = _caption(post)
    media = _media_list(post)
    if len(media) > 1:
        # Múltiplas fotos: sobe cada uma sem publicar e anexa no /feed.
        media_fbids = []
        for url in media[:10]:
            up = httpx.post(
                f"{base}/photos",
                data={"url": url, "published": "false", "access_token": token},
                timeout=30,
            )
            if up.status_code >= 400:
                _raise_http("Facebook", up)
            media_fbids.append({"media_fbid": up.json().get("id")})
        data = {"message": caption, "access_token": token}
        for i, m in enumerate(media_fbids):
            data[f"attached_media[{i}]"] = json.dumps(m)
        r = httpx.post(f"{base}/feed", data=data, timeout=30)
    elif media:
        r = httpx.post(
            f"{base}/photos",
            data={"url": media[0], "caption": caption, "access_token": token},
            timeout=30,
        )
    else:
        r = httpx.post(
            f"{base}/feed", data={"message": caption, "access_token": token}, timeout=30
        )
    if r.status_code >= 400:
        _raise_http("Facebook", r)
    d = r.json()
    return str(d.get("post_id") or d.get("id", ""))


def _metrics_facebook(post, account, token) -> dict:
    if not post.external_id:
        return dict(_ZERO_METRICS)
    base = f"https://graph.facebook.com/{FB_GRAPH_VERSION}/{post.external_id}"
    ins = httpx.get(
        f"{base}/insights",
        params={"metric": "post_impressions,post_clicks", "access_token": token},
        timeout=20,
    )
    eng = httpx.get(
        base,
        params={
            "fields": "likes.summary(true),comments.summary(true),shares",
            "access_token": token,
        },
        timeout=20,
    )
    out = dict(_ZERO_METRICS)
    if ins.status_code < 400:
        for d in ins.json().get("data", []):
            val = (d.get("values") or [{}])[0].get("value", 0)
            if d["name"] == "post_impressions":
                out["impressions"] = val
            elif d["name"] == "post_clicks":
                out["clicks"] = val
    if eng.status_code < 400:
        e = eng.json()
        out["likes"] = (e.get("likes") or {}).get("summary", {}).get("total_count", 0)
        out["comments"] = (e.get("comments") or {}).get("summary", {}).get("total_count", 0)
        out["shares"] = (e.get("shares") or {}).get("count", 0)
    return out


# --------------------------------------------------------------------------- #
# LinkedIn
# --------------------------------------------------------------------------- #
def _linkedin_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": LINKEDIN_VERSION,
    }


def _publish_linkedin(post, account, token) -> str:
    author = f"urn:li:person:{account.external_id}"
    headers = _linkedin_headers(token)
    content = None
    media = _media_list(post)

    if media:
        # 1) initializeUpload → uploadUrl + image urn (usa a 1ª mídia)
        init = httpx.post(
            "https://api.linkedin.com/rest/images?action=initializeUpload",
            headers=headers,
            json={"initializeUploadRequest": {"owner": author}},
            timeout=20,
        )
        if init.status_code >= 400:
            _raise_http("LinkedIn", init)
        val = init.json().get("value", {})
        upload_url, image_urn = val.get("uploadUrl"), val.get("image")
        # 2) upload dos bytes
        raw, mime = _download(media[0])
        up = httpx.put(
            upload_url,
            content=raw,
            headers={"Authorization": f"Bearer {token}", "Content-Type": mime},
            timeout=60,
        )
        if up.status_code >= 400:
            _raise_http("LinkedIn(upload)", up)
        content = {"media": {"id": image_urn}}

    body = {
        "author": author,
        "commentary": _caption(post),
        "visibility": "PUBLIC",
        "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": []},
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    if content:
        body["content"] = content
    r = httpx.post("https://api.linkedin.com/rest/posts", headers=headers, json=body, timeout=30)
    if r.status_code >= 400:
        _raise_http("LinkedIn", r)
    # A urn do post volta no header x-restli-id (não no corpo).
    return r.headers.get("x-restli-id", "")


def _metrics_linkedin(post, account, token) -> dict:
    if not post.external_id:
        return dict(_ZERO_METRICS)
    r = httpx.get(
        f"https://api.linkedin.com/rest/socialActions/{post.external_id}",
        headers=_linkedin_headers(token),
        timeout=20,
    )
    out = dict(_ZERO_METRICS)
    if r.status_code < 400:
        d = r.json()
        out["likes"] = (d.get("likesSummary") or {}).get("totalLikes", 0)
        out["comments"] = (d.get("commentsSummary") or {}).get("totalFirstLevelComments", 0)
    return out  # impressions exigem Organization Analytics (não disponível p/ pessoa)


# --------------------------------------------------------------------------- #
# X (Twitter)
# --------------------------------------------------------------------------- #
def _x_upload_media(token: str, media_url: str) -> str:
    raw, mime = _download(media_url)
    headers = {"Authorization": f"Bearer {token}"}
    category = "tweet_video" if mime.startswith("video") else "tweet_image"
    init = httpx.post(
        "https://api.x.com/2/media/upload",
        headers=headers,
        data={
            "command": "INIT",
            "total_bytes": str(len(raw)),
            "media_type": mime,
            "media_category": category,
        },
        timeout=30,
    )
    if init.status_code >= 400:
        _raise_http("X(media init)", init)
    media_id = init.json().get("data", {}).get("id") or init.json().get("media_id_string")
    # APPEND em chunks de até 5 MB
    for i, off in enumerate(range(0, len(raw), 4_000_000)):
        ap = httpx.post(
            "https://api.x.com/2/media/upload",
            headers=headers,
            data={"command": "APPEND", "media_id": media_id, "segment_index": str(i)},
            files={"media": raw[off : off + 4_000_000]},
            timeout=60,
        )
        if ap.status_code >= 400:
            _raise_http("X(media append)", ap)
    fin = httpx.post(
        "https://api.x.com/2/media/upload",
        headers=headers,
        data={"command": "FINALIZE", "media_id": media_id},
        timeout=30,
    )
    if fin.status_code >= 400:
        _raise_http("X(media finalize)", fin)
    return str(media_id)


def _publish_x(post, account, token) -> str:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body: dict = {"text": _caption(post)}
    media = _media_list(post)
    if media:
        # X aceita até 4 imagens (ou 1 vídeo) por post.
        ids = [_x_upload_media(token, u) for u in media[:4]]
        body["media"] = {"media_ids": ids}
    r = httpx.post("https://api.x.com/2/tweets", headers=headers, json=body, timeout=30)
    if r.status_code >= 400:
        _raise_http("X", r)
    return str(r.json().get("data", {}).get("id", ""))


def _metrics_x(post, account, token) -> dict:
    if not post.external_id:
        return dict(_ZERO_METRICS)
    r = httpx.get(
        f"https://api.x.com/2/tweets/{post.external_id}",
        headers={"Authorization": f"Bearer {token}"},
        params={"tweet.fields": "public_metrics"},
        timeout=20,
    )
    if r.status_code >= 400:
        return dict(_ZERO_METRICS)
    m = (r.json().get("data") or {}).get("public_metrics") or {}
    return {
        "impressions": m.get("impression_count", 0),
        "likes": m.get("like_count", 0),
        "comments": m.get("reply_count", 0),
        "shares": m.get("retweet_count", 0) + m.get("quote_count", 0),
        "clicks": 0,  # clicks só via /2/tweets/.../metrics (organic, elevado)
    }


# --------------------------------------------------------------------------- #
# TikTok (Direct Post — vídeo via PULL_FROM_URL)
# --------------------------------------------------------------------------- #
def _publish_tiktok(post, account, token) -> str:
    media = _media_list(post)
    if not media:
        raise PublishError("TikTok exige um vídeo.")
    r = httpx.post(
        "https://open.tiktokapis.com/v2/post/publish/video/init/",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={
            "post_info": {
                "title": _caption(post)[:2200],
                "privacy_level": "PUBLIC_TO_EVERYONE",
            },
            "source_info": {"source": "PULL_FROM_URL", "video_url": media[0]},
        },
        timeout=30,
    )
    if r.status_code >= 400:
        _raise_http("TikTok", r)
    return str((r.json().get("data") or {}).get("publish_id", ""))


def _metrics_tiktok(post, account, token) -> dict:
    # Métricas por vídeo exigem video.list com os video_id publicados; a init só
    # devolve publish_id. Sem esse mapeamento, retornamos zeros (sem inventar).
    return dict(_ZERO_METRICS)


# --------------------------------------------------------------------------- #
# YouTube (resumable upload)
# --------------------------------------------------------------------------- #
def _publish_youtube(post, account, token) -> str:
    media = _media_list(post)
    if not media:
        raise PublishError("YouTube exige um vídeo.")
    raw, mime = _download(media[0])
    caption = _caption(post)
    meta = {
        "snippet": {"title": (post.content[:100] or "Vídeo"), "description": caption},
        "status": {"privacyStatus": "public"},
    }
    init = httpx.post(
        "https://www.googleapis.com/upload/youtube/v3/videos",
        params={"uploadType": "resumable", "part": "snippet,status"},
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": mime,
            "X-Upload-Content-Length": str(len(raw)),
        },
        json=meta,
        timeout=30,
    )
    if init.status_code >= 400:
        _raise_http("YouTube", init)
    session_url = init.headers.get("Location")
    if not session_url:
        raise PublishError("YouTube não retornou a URL de upload resumable.")
    up = httpx.put(
        session_url,
        content=raw,
        headers={"Content-Type": mime, "Content-Length": str(len(raw))},
        timeout=300,
    )
    if up.status_code >= 400:
        _raise_http("YouTube(upload)", up)
    return str(up.json().get("id", ""))


def _metrics_youtube(post, account, token) -> dict:
    if not post.external_id:
        return dict(_ZERO_METRICS)
    r = httpx.get(
        "https://www.googleapis.com/youtube/v3/videos",
        params={"part": "statistics", "id": post.external_id},
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    if r.status_code >= 400:
        return dict(_ZERO_METRICS)
    items = r.json().get("items") or []
    if not items:
        return dict(_ZERO_METRICS)
    st = items[0].get("statistics", {})
    return {
        "impressions": int(st.get("viewCount", 0)),
        "likes": int(st.get("likeCount", 0)),
        "comments": int(st.get("commentCount", 0)),
        "shares": 0,
        "clicks": 0,
    }


# --------------------------------------------------------------------------- #
# Dispatch
# --------------------------------------------------------------------------- #
_PUBLISHERS = {
    "instagram": _publish_instagram,
    "facebook": _publish_facebook,
    "linkedin": _publish_linkedin,
    "x": _publish_x,
    "tiktok": _publish_tiktok,
    "youtube": _publish_youtube,
}
_COLLECTORS = {
    "instagram": _metrics_instagram,
    "facebook": _metrics_facebook,
    "linkedin": _metrics_linkedin,
    "x": _metrics_x,
    "tiktok": _metrics_tiktok,
    "youtube": _metrics_youtube,
}


def publish_post(post) -> dict:
    """Publica o post na rede real. Retorna {"external_id"}. Levanta PublishError."""
    account = post.account
    fn = _PUBLISHERS.get(account.channel)
    if fn is None:
        raise PublishError(f"Canal não suportado para publicação: {account.channel}")
    token = _token(account)
    external_id = fn(post, account, token)
    if not external_id:
        raise PublishError(f"{account.channel}: publicação sem id de retorno.")
    return {"external_id": external_id}


def collect_metrics(post) -> dict:
    """Coleta métricas reais do post publicado. Campos ausentes = 0."""
    account = post.account
    fn = _COLLECTORS.get(account.channel)
    if fn is None:
        return dict(_ZERO_METRICS)
    try:
        token = _token(account)
        return fn(post, account, token)
    except PublishError:
        return dict(_ZERO_METRICS)
