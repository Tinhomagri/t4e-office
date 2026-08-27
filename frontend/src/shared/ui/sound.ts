// Bipe curto via Web Audio — sem depender de arquivo de áudio nenhum.
export function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    osc.type = "sine"
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.35)
  } catch {
    // Navegador sem AudioContext ou bloqueou autoplay — silencioso, sem quebrar a tela.
  }
}

// Trecho tipo "boop-boop-BIP!" pra mão levantada — três notas subindo, mais
// engraçadinho que o bipe único genérico. Osciladores separados (não dá pra
// reusar um só entre notas depois de `.stop()`).
export function handRaiseChime() {
  try {
    const ctx = new AudioContext()
    const notes: [freq: number, start: number, dur: number, type: OscillatorType][] = [
      [523, 0, 0.1, "triangle"], // Dó
      [659, 0.09, 0.1, "triangle"], // Mi
      [988, 0.18, 0.22, "square"], // Si, mais alto e com timbre mais "cartoon"
    ]
    for (const [freq, start, dur, type] of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      osc.type = type
      const t0 = ctx.currentTime + start
      gain.gain.setValueAtTime(0.18, t0)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + dur)
    }
  } catch {
    // Navegador sem AudioContext ou bloqueou autoplay — silencioso, sem quebrar a tela.
  }
}
