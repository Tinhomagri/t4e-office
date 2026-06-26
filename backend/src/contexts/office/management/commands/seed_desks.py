from django.core.management.base import BaseCommand

from contexts.office.infrastructure.django.models import DeskModel

# Posições exatas das 24 mesas no MAP_TILES (tile_x, tile_y).
# Correspondem aos tiles D nas rows 4-5, 10-11, 16-17 do mapa 22×38.
# 6 grupos de 4: 3 bandas horizontais × 2 colunas (esq=cols3,5 / dir=cols15,17)
DESK_POSITIONS = [
    # Grupo 1 — banda superior esquerda (rows 4-5, cols 3,5)
    (1, 1, 3, 4), (1, 2, 5, 4), (1, 3, 3, 5), (1, 4, 5, 5),
    # Grupo 2 — banda superior direita (rows 4-5, cols 15,17)
    (2, 1, 15, 4), (2, 2, 17, 4), (2, 3, 15, 5), (2, 4, 17, 5),
    # Grupo 3 — banda média esquerda (rows 10-11)
    (3, 1, 3, 10), (3, 2, 5, 10), (3, 3, 3, 11), (3, 4, 5, 11),
    # Grupo 4 — banda média direita
    (4, 1, 15, 10), (4, 2, 17, 10), (4, 3, 15, 11), (4, 4, 17, 11),
    # Grupo 5 — banda inferior esquerda (rows 16-17)
    (5, 1, 3, 16), (5, 2, 5, 16), (5, 3, 3, 17), (5, 4, 5, 17),
    # Grupo 6 — banda inferior direita
    (6, 1, 15, 16), (6, 2, 17, 16), (6, 3, 15, 17), (6, 4, 17, 17),
]


class Command(BaseCommand):
    help = "Cria as 24 mesas do escritório T4E."

    def handle(self, *args, **options):
        if DeskModel.objects.exists():
            self.stdout.write("Mesas já existem — pulando seed.")
            return

        for g_idx, p_idx, tx, ty in DESK_POSITIONS:
            DeskModel.objects.create(
                label=f"Mesa {(g_idx - 1) * 4 + p_idx}",
                group_number=g_idx,
                position_in_group=p_idx,
                tile_x=tx,
                tile_y=ty,
                is_fixed=False,
            )

        self.stdout.write(self.style.SUCCESS("24 mesas criadas."))
