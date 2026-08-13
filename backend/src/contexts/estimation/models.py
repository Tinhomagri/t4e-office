"""Ponto de descoberta de models pelo Django (models reais em infrastructure).

Sem este módulo o Django nunca importa os modelos deste contexto por conta
própria: eles só entram no registro quando alguma view os importa. Uma
ForeignKey de outro app apontando para cá (`"estimation.SquadModel"`) ficaria
pendente para sempre — foi o que aconteceu ao ligar o board à squad.
"""
from contexts.estimation.infrastructure.django.models import (  # noqa: F401
    PokerParticipantModel,
    PokerReactionModel,
    PokerRoundModel,
    PokerSessionModel,
    PokerVoteModel,
    SquadMemberModel,
    SquadModel,
)
