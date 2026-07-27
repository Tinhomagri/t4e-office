// Geografia da cena de login: coordenadas → posição na esfera, e fuso horário
// → coordenadas aproximadas.
//
// Tudo aqui é matemática pura e uma tabela — nenhuma chamada de rede, nenhum
// pedido de permissão. É o que permite o ponto verde aparecer no lugar certo
// assim que a tela abre, antes de qualquer interação.

export interface LatLon {
  lat: number
  lon: number
  /** Rótulo humano, mostrado junto do marcador. */
  label: string
  /** true quando veio do GPS, false quando foi inferido do fuso horário. */
  precise: boolean
}

const DEG = Math.PI / 180

/**
 * Converte lat/long para um ponto na esfera de raio `r`.
 *
 * A convenção precisa casar com o mapeamento UV da SphereGeometry do three,
 * que é equirretangular com a costura em -180°: por isso o X é negativo e o
 * ângulo horizontal parte de lon+180.
 */
export function latLonToVector3(
  lat: number,
  lon: number,
  r: number,
): { x: number; y: number; z: number } {
  const phi = (90 - lat) * DEG
  const theta = (lon + 180) * DEG
  return {
    x: -r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * Math.sin(phi) * Math.sin(theta),
  }
}

/**
 * Rotação Y que traz uma longitude para a frente da câmera (+Z).
 * Usada para o globo girar até a posição do usuário.
 */
export function lonToFacingRotation(lon: number): number {
  // Em theta = (lon+180)°, o ponto está em +Z quando theta = 90°, ou seja
  // lon = -90. A rotação necessária é a diferença até lá.
  return (-lon - 90) * DEG
}

// Fuso horário → cidade de referência. Cobre as zonas mais prováveis dos
// usuários do produto (Brasil em primeiro lugar) e as capitais globais mais
// comuns; qualquer coisa fora disso cai no fallback.
const TZ_TABLE: Record<string, { lat: number; lon: number; label: string }> = {
  "America/Sao_Paulo": { lat: -23.55, lon: -46.63, label: "São Paulo" },
  "America/Bahia": { lat: -12.97, lon: -38.5, label: "Salvador" },
  "America/Fortaleza": { lat: -3.73, lon: -38.52, label: "Fortaleza" },
  "America/Recife": { lat: -8.05, lon: -34.9, label: "Recife" },
  "America/Belem": { lat: -1.46, lon: -48.5, label: "Belém" },
  "America/Manaus": { lat: -3.12, lon: -60.02, label: "Manaus" },
  "America/Cuiaba": { lat: -15.6, lon: -56.1, label: "Cuiabá" },
  "America/Campo_Grande": { lat: -20.45, lon: -54.62, label: "Campo Grande" },
  "America/Porto_Velho": { lat: -8.76, lon: -63.9, label: "Porto Velho" },
  "America/Boa_Vista": { lat: 2.82, lon: -60.67, label: "Boa Vista" },
  "America/Rio_Branco": { lat: -9.97, lon: -67.81, label: "Rio Branco" },
  "America/Maceio": { lat: -9.67, lon: -35.74, label: "Maceió" },
  "America/Araguaina": { lat: -7.19, lon: -48.21, label: "Araguaína" },
  "America/Santarem": { lat: -2.44, lon: -54.7, label: "Santarém" },
  "America/Argentina/Buenos_Aires": { lat: -34.6, lon: -58.38, label: "Buenos Aires" },
  "America/Santiago": { lat: -33.45, lon: -70.67, label: "Santiago" },
  "America/Bogota": { lat: 4.71, lon: -74.07, label: "Bogotá" },
  "America/Lima": { lat: -12.05, lon: -77.04, label: "Lima" },
  "America/Mexico_City": { lat: 19.43, lon: -99.13, label: "Cidade do México" },
  "America/New_York": { lat: 40.71, lon: -74.01, label: "Nova York" },
  "America/Chicago": { lat: 41.88, lon: -87.63, label: "Chicago" },
  "America/Denver": { lat: 39.74, lon: -104.99, label: "Denver" },
  "America/Los_Angeles": { lat: 34.05, lon: -118.24, label: "Los Angeles" },
  "America/Toronto": { lat: 43.65, lon: -79.38, label: "Toronto" },
  "Europe/Lisbon": { lat: 38.72, lon: -9.14, label: "Lisboa" },
  "Europe/Madrid": { lat: 40.42, lon: -3.7, label: "Madri" },
  "Europe/London": { lat: 51.51, lon: -0.13, label: "Londres" },
  "Europe/Paris": { lat: 48.86, lon: 2.35, label: "Paris" },
  "Europe/Berlin": { lat: 52.52, lon: 13.4, label: "Berlim" },
  "Europe/Rome": { lat: 41.9, lon: 12.5, label: "Roma" },
  "Europe/Amsterdam": { lat: 52.37, lon: 4.9, label: "Amsterdã" },
  "Europe/Dublin": { lat: 53.35, lon: -6.26, label: "Dublin" },
  "Europe/Moscow": { lat: 55.76, lon: 37.62, label: "Moscou" },
  "Africa/Luanda": { lat: -8.84, lon: 13.23, label: "Luanda" },
  "Africa/Lagos": { lat: 6.52, lon: 3.38, label: "Lagos" },
  "Africa/Johannesburg": { lat: -26.2, lon: 28.05, label: "Joanesburgo" },
  "Africa/Cairo": { lat: 30.04, lon: 31.24, label: "Cairo" },
  "Asia/Dubai": { lat: 25.2, lon: 55.27, label: "Dubai" },
  "Asia/Tokyo": { lat: 35.68, lon: 139.69, label: "Tóquio" },
  "Asia/Shanghai": { lat: 31.23, lon: 121.47, label: "Xangai" },
  "Asia/Singapore": { lat: 1.35, lon: 103.82, label: "Singapura" },
  "Asia/Kolkata": { lat: 19.08, lon: 72.88, label: "Mumbai" },
  "Australia/Sydney": { lat: -33.87, lon: 151.21, label: "Sydney" },
}

/** Sede: usado quando o fuso é desconhecido. */
export const FALLBACK: LatLon = {
  lat: -23.55,
  lon: -46.63,
  label: "Brasil",
  precise: false,
}

/**
 * Posição aproximada a partir do fuso horário do navegador.
 * Não pede permissão, não usa rede e funciona offline.
 */
export function locationFromTimezone(tz?: string): LatLon {
  const zone =
    tz ??
    (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined)
  if (!zone) return FALLBACK

  const hit = TZ_TABLE[zone]
  if (hit) return { ...hit, precise: false }

  // Sem cidade exata: usa a longitude implícita no deslocamento UTC. Melhor um
  // ponto no meridiano certo do que jogar todo mundo em São Paulo.
  const guess = longitudeFromOffset()
  if (guess === null) return FALLBACK
  return { lat: 0, lon: guess, label: zone.split("/").pop()?.replace(/_/g, " ") ?? zone, precise: false }
}

/** Longitude aproximada derivada do deslocamento UTC (15° por hora). */
export function longitudeFromOffset(date = new Date()): number | null {
  const offsetMin = -date.getTimezoneOffset()
  if (!Number.isFinite(offsetMin)) return null
  const lon = (offsetMin / 60) * 15
  return Math.max(-180, Math.min(180, lon))
}
