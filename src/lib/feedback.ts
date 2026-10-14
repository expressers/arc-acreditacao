/** Som + vibração curtos para o porteiro perceber o resultado sem olhar. */
let ctx: AudioContext | null = null

function tone(freq: number, start: number, dur: number) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
  osc.connect(gain).connect(ctx.destination)
  osc.start(ctx.currentTime + start)
  osc.stop(ctx.currentTime + start + dur + 0.02)
}

/** Tem de ser chamado num gesto do utilizador (iOS). */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
}

export function feedback(kind: 'ok' | 'duplicate' | 'invalid') {
  try {
    if (kind === 'ok') {
      tone(880, 0, 0.09)
      tone(1320, 0.1, 0.14)
      navigator.vibrate?.(60)
    } else if (kind === 'duplicate') {
      tone(520, 0, 0.16)
      tone(520, 0.22, 0.16)
      navigator.vibrate?.([80, 60, 80])
    } else {
      tone(220, 0, 0.35)
      navigator.vibrate?.([200, 80, 200])
    }
  } catch {
    /* sem áudio */
  }
}
