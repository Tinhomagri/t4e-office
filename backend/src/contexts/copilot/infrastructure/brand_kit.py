"""Kit de marca por workspace: leitura, escrita e injeção de contexto na IA.

O tom de voz e diretrizes cadastrados aqui são prefixados nos prompts de copy,
campanha e repurpose para que tudo saia on-brand.
"""
from __future__ import annotations

from contexts.copilot.infrastructure.django.models import WorkspaceBrandKitModel


def get_brand_kit(workspace_id: str) -> WorkspaceBrandKitModel | None:
    return WorkspaceBrandKitModel.objects.filter(workspace_id=workspace_id).first()


def brand_kit_public_dict(kit: WorkspaceBrandKitModel | None) -> dict:
    if kit is None:
        return {
            "tone_of_voice": "",
            "colors": [],
            "fonts": "",
            "logo_url": "",
            "guidelines": "",
        }
    return {
        "tone_of_voice": kit.tone_of_voice,
        "colors": kit.colors or [],
        "fonts": kit.fonts,
        "logo_url": kit.logo_url,
        "guidelines": kit.guidelines,
    }


def save_brand_kit(
    *,
    workspace_id: str,
    tone_of_voice: str,
    colors: list,
    fonts: str,
    logo_url: str,
    guidelines: str,
    updated_by_id: str | None = None,
) -> WorkspaceBrandKitModel:
    kit = WorkspaceBrandKitModel.objects.filter(workspace_id=workspace_id).first()
    if kit is None:
        kit = WorkspaceBrandKitModel(workspace_id=workspace_id)
    kit.tone_of_voice = tone_of_voice
    kit.colors = colors
    kit.fonts = fonts
    kit.logo_url = logo_url
    kit.guidelines = guidelines
    if updated_by_id:
        kit.updated_by_id = updated_by_id
    kit.save()
    return kit


def brand_prompt_snippet(workspace_id: str) -> str:
    """Trecho a prefixar nos prompts de marketing (vazio se não houver kit)."""
    kit = get_brand_kit(workspace_id)
    if kit is None:
        return ""
    lines: list[str] = []
    if kit.tone_of_voice.strip():
        lines.append(f"Tom de voz da marca (siga sempre): {kit.tone_of_voice.strip()}")
    if kit.guidelines.strip():
        lines.append(f"Diretrizes da marca: {kit.guidelines.strip()}")
    if not lines:
        return ""
    return "\n".join(lines) + "\n"
