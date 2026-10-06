// Qual microfone, câmera e saída de áudio a pessoa escolheu — guardado no
// navegador, não na sessão.
//
// Sem isto, cada entrada numa sala recomeça do dispositivo que o navegador
// elege sozinho (quase sempre o primeiro da lista do sistema, não o headset
// que a pessoa acabou de plugar). O resultado era trocar o microfone na mão a
// cada reunião.

export type PreferredDeviceKind = "audioinput" | "videoinput" | "audiooutput"

const STORAGE_KEY: Record<PreferredDeviceKind, string> = {
  audioinput: "t4e.device.audioinput",
  videoinput: "t4e.device.videoinput",
  audiooutput: "t4e.device.audiooutput",
}

export function getPreferredDevice(kind: PreferredDeviceKind): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY[kind]) || undefined
  } catch {
    // Modo anônimo com storage bloqueado: segue com o padrão do navegador.
    return undefined
  }
}

export function setPreferredDevice(kind: PreferredDeviceKind, deviceId: string | undefined): void {
  try {
    if (deviceId) localStorage.setItem(STORAGE_KEY[kind], deviceId)
    else localStorage.removeItem(STORAGE_KEY[kind])
  } catch {
    // idem
  }
}

/**
 * Restrição de dispositivo para o getUserMedia.
 *
 * `ideal` e não `exact` de propósito: o headset guardado ontem pode não estar
 * plugado hoje, e `exact` devolveria OverconstrainedError — ou seja, entrar na
 * reunião sem áudio nenhum. Com `ideal` o navegador usa o preferido quando ele
 * existe e cai no padrão quando não existe.
 */
export function preferredConstraint(
  kind: PreferredDeviceKind,
): { deviceId: { ideal: string } } | undefined {
  const id = getPreferredDevice(kind)
  return id ? { deviceId: { ideal: id } } : undefined
}
