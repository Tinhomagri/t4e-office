"""Geografia dos leads — porte de geografia.ts do T4E OS.

A planilha é preenchida por pessoas, então "São Paulo", "sao paulo" e
"guaratinguetasp" convivem. As regras abaixo, em ordem, resolvem quase tudo;
o resto vira "sem local" — informação honesta, não erro a esconder.
"""
from __future__ import annotations

import re
import unicodedata

STATES = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
    "SP", "SE", "TO",
]

# Centroides aproximados (longitude, latitude), pra posicionar o rótulo no mapa.
STATE_CENTROID: dict[str, tuple[float, float]] = {
    "AC": (-70.5, -9.0), "AL": (-36.6, -9.6), "AP": (-51.8, 1.4), "AM": (-64.6, -4.1),
    "BA": (-41.7, -12.5), "CE": (-39.6, -5.2), "DF": (-47.9, -15.8), "ES": (-40.3, -19.6),
    "GO": (-49.6, -16.0), "MA": (-45.3, -5.4), "MT": (-55.9, -13.7), "MS": (-54.6, -20.5),
    "MG": (-44.6, -18.5), "PA": (-52.3, -4.0), "PB": (-36.8, -7.1), "PR": (-51.6, -24.6),
    "PE": (-37.9, -8.4), "PI": (-42.8, -7.4), "RJ": (-42.6, -22.3), "RN": (-36.5, -5.8),
    "RS": (-53.2, -30.0), "RO": (-63.0, -10.9), "RR": (-61.4, 2.1), "SC": (-50.5, -27.2),
    "SP": (-48.6, -22.2), "SE": (-37.4, -10.6), "TO": (-48.3, -10.2),
}

# Cidades que aparecem na planilha, normalizadas (sem acento, sem espaço).
CITY_STATE: dict[str, str] = {
    "saopaulo": "SP", "sao.paulo": "SP", "riodejaneiro": "RJ", "rio": "RJ", "goiania": "GO",
    "salvador": "BA", "manaus": "AM", "belohorizonte": "MG", "brasilia": "DF", "brazlandia": "DF",
    "portoalegre": "RS", "campogrande": "MS", "recife": "PE", "cuiaba": "MT", "maringa": "PR",
    "fortaleza": "CE", "parauapebas": "PA", "ribeiraopreto": "SP", "caruaru": "PE", "vilavelha": "ES",
    "saoluis": "MA", "vitoriadaconquista": "BA", "joaopessoa": "PB", "duquedecaxias": "RJ",
    "belem": "PA", "santoandre": "SP", "embudasartes": "SP", "jundiai": "SP", "joinville": "SC",
    "campinas": "SP", "florianopolis": "SC", "palmas": "TO", "petropolis": "RJ", "londrina": "PR",
    "lajeado": "RS", "rioverde": "GO", "curitiba": "PR", "contagem": "MG", "laurodefreitas": "BA",
    "mogidascruzes": "SP", "marica": "RJ", "boavista": "RR", "guarulhos": "SP", "limeira": "SP",
    "manhuacu": "MG", "paulinia": "SP", "sobral": "CE", "praiagrande": "SP", "caceres": "MT",
    "toledo": "PR", "saoborja": "RS", "itabuna": "BA", "camboriu": "SC", "montesclaros": "MG",
    "cotia": "SP", "timoteo": "MG", "campinagrande": "PB", "hortolandia": "SP", "blumenau": "SC",
    "olinda": "PE", "valparaiso": "GO", "ariquemes": "RO", "ubatuba": "SP", "novafriburgo": "RJ",
    "formiga": "MG", "rioclaro": "SP", "itauna": "MG", "guarapari": "ES", "portovelho": "RO",
    "novohamburgo": "RS", "juazeirodonorte": "CE", "diadema": "SP", "botucatu": "SP", "boituva": "SP",
    "juazeiro": "BA", "canoas": "RS", "ananindeua": "PA", "itaituba": "PA", "vitoria": "ES",
    "barueri": "SP", "ibirite": "MG", "novaiguacu": "RJ", "patrocinio": "MG", "fozdoiguacu": "PR",
    "gravatai": "RS", "brumadinho": "MG", "videira": "SC", "uba": "MG", "serra": "ES", "maraba": "PA",
    "bauru": "SP", "passos": "MG", "sorocaba": "SP", "aracaju": "SE", "paranavai": "PR",
    "itaperuna": "RJ", "cameta": "PA", "goianesia": "GO", "dourados": "MS", "natal": "RN",
    "palhoca": "SC", "iturama": "MG", "taubate": "SP", "niteroi": "RJ", "maceio": "AL",
    "barbacena": "MG", "parnaiba": "PI", "santamaria": "RS", "guaira": "SP", "betim": "MG",
    "teixeiradefreitas": "BA", "crato": "CE", "serrinha": "BA", "guanambi": "BA",
    "portoseguro": "BA", "redencao": "PA", "pedreiras": "MA", "riobranco": "AC", "sumare": "SP",
    "bomjesusdalapa": "BA", "xanxere": "SC", "arraialdocabo": "RJ", "santocristo": "RS",
    "caxiasdosul": "RS",
}


def _normalize_city(raw: str | None) -> str:
    text = unicodedata.normalize("NFD", (raw or "").strip().lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z]", "", text)


def state_for(city: str | None, state: str | None) -> str | None:
    upper = (state or "").strip().upper()
    if upper in STATES:
        return upper

    key = _normalize_city(city)
    if not key:
        return None

    known = CITY_STATE.get(key)
    if known:
        return known

    # UF grudada no fim do nome (`betimmg`, `guaratinguetasp`). Corte em 4
    # letras evita que "goias" vire "AS".
    suffix = key[-2:].upper()
    if suffix in STATES and len(key) > 4:
        return suffix

    if "matogrosso" in key:
        return "MT"
    if "tocantins" in key:
        return "TO"
    return None
