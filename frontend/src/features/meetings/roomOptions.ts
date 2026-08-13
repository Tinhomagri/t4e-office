// Configuração de mídia de TODAS as salas (Escritório, Planning Poker,
// Reuniões). Um lugar só, porque divergir aqui significa uma tela consumindo
// dez vezes mais banda que a outra sem ninguém perceber.
//
// Contexto que motivou estes números: uma sala de 9 pessoas estava puxando
// 120 Mbps do escritório — ~13 Mbps por participante, para exibir cada pessoa
// num cartão de 128×96 pixels. O gargalo não era o servidor, era o link e o
// Wi-Fi da empresa.
import {
  AudioPresets,
  VideoPresets,
  type RoomOptions,
} from "livekit-client"

/**
 * Quanto o vídeo publicado pode gastar, no máximo.
 *
 * Os cartões da mesa têm 128×96 e os do Escritório são menores ainda. Publicar
 * 720p para desenhar nesse tamanho é jogar fora ~95% dos pixels no caminho —
 * e o custo é pago no upload de quem transmite e no download de todo mundo.
 */
const CAPTURA = {
  ...VideoPresets.h360.resolution,
  // 15 qps em vez de 30: metade dos quadros, metade do custo. Numa reunião a
  // imagem é quase estática — o que se perde é fluidez de movimento brusco,
  // que ninguém procura num cartão de 128×96.
  frameRate: 15,
}

export const ROOM_OPTIONS: RoomOptions = {
  /**
   * O servidor passa a enviar a camada compatível com o TAMANHO REAL do vídeo
   * na tela, e para de enviar o que está fora da área visível.
   *
   * É a diferença de comportamento que se nota entre o nosso e o Meet: sem
   * isto, cada pessoa recebe todos os vídeos em qualidade cheia o tempo todo,
   * mesmo os que aparecem do tamanho de um selo ou nem estão na tela.
   */
  adaptiveStream: true,

  /**
   * Para de TRANSMITIR camadas que ninguém está consumindo.
   *
   * Complementa o adaptiveStream do outro lado da linha: se todos veem você
   * pequeno, sua máquina deixa de subir a camada grande — economia no upload,
   * que é o lado mais estreito de qualquer link de escritório.
   */
  dynacast: true,

  videoCaptureDefaults: {
    resolution: CAPTURA,
  },

  publishDefaults: {
    // Três camadas: o servidor escolhe por espectador. Quem vê em selo recebe
    // h90; quem abrir o vídeo grande recebe h360.
    simulcast: true,
    videoSimulcastLayers: [VideoPresets.h90, VideoPresets.h180],

    /**
     * Prioriza a nitidez do que está parado (texto, rosto quieto) em vez da
     * fluidez, quando a rede aperta. Numa reunião, quadro caindo de 30 para 15
     * incomoda menos que imagem virando bloco.
     */
    degradationPreference: "maintain-resolution",

    /**
     * Silêncio deixa de ocupar banda: o Opus para de enviar quadros quando
     * ninguém fala. Com 9 pessoas na sala e uma falando, são 8 fluxos que
     * praticamente zeram.
     */
    dtx: true,
    // Redundância do áudio: recupera perda de pacote sem retransmitir. Custa
    // pouco e é o que evita a voz "picotar" em Wi-Fi cheio.
    red: true,
    audioPreset: AudioPresets.speech,
  },

  /**
   * Solta o microfone do sistema ao mudar o áudio.
   *
   * Sem isto o navegador segue com o mic aberto (e o indicador de gravação
   * aceso) mesmo mudo — desconfortável, e mantém a captura ativa à toa.
   */
  stopLocalTrackOnUnpublish: true,
}
