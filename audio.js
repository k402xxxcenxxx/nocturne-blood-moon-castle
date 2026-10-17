// Original procedural sound: no downloads, samples, or autoplay dependency.
export class AudioSystem {
  constructor() {
    this.muted = false;
    this.haptics = true;
    this.music = true;
    this.context = null;
    this._paused = false;
    this._voices = new Set();
    this._musicTimer = null;
    this._step = 0;
  }

  async unlock() {
    if (!this.context) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return false;
      try {
        const ctx = this.context = new Context();
        this._master = ctx.createGain();
        this._master.gain.value = this.muted ? 0 : 0.6;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -13;
        limiter.knee.value = 14;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.12;
        this._master.connect(limiter);
        limiter.connect(ctx.destination);
        this._noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const samples = this._noiseBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      } catch {
        this.context?.close().catch(() => {});
        this.context = null;
        return false;
      }
    }
    this._paused = false;
    return this.resume();
  }

  setMuted(value) {
    this.muted = Boolean(value);
    if (this.context) {
      this._master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.context.currentTime, 0.025);
    }
    this._syncMusic();
  }

  setHaptics(value) {
    this.haptics = Boolean(value);
    if (!this.haptics) this.vibrate(0);
  }

  setMusic(value) {
    this.music = Boolean(value);
    this._syncMusic();
  }

  // iOS Safari does not expose vibration; the game still plays normally.
  vibrate(pattern) {
    if ((!this.haptics || this._paused) && pattern !== 0) return;
    if (globalThis.navigator?.userActivation?.hasBeenActive === false) return;
    try { globalThis.navigator?.vibrate?.(pattern); } catch { /* Optional hardware. */ }
  }

  suspend() {
    this._paused = true;
    this._syncMusic();
    for (const voice of [...this._voices]) voice.stop();
    this.vibrate(0);
    return this.context?.suspend().catch(() => {});
  }

  async resume() {
    this._paused = false;
    if (!this.context) return false;
    try {
      await this.context.resume();
      this._syncMusic();
      return this.context.state === 'running';
    } catch { return false; }
  }

  _voice(type, frequency, duration, gain, at, endFrequency, music = false) {
    if (this._voices.size >= 64) this._voices.values().next().value.stop();
    const ctx = this.context;
    const source = type === 'noise' ? ctx.createBufferSource() : ctx.createOscillator();
    const envelope = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = type === 'noise' ? frequency : music ? 1000 : 8000;
    if (type === 'noise') {
      source.buffer = this._noiseBuffer;
      source.loop = true;
      if (endFrequency) filter.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    } else {
      source.type = type;
      source.frequency.setValueAtTime(frequency, at);
      if (endFrequency) source.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    }
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), at + (music ? 0.09 : 0.004));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this._master);
    let ended = false;
    const voice = { music, stop: () => {
      if (ended) return;
      ended = true;
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
      this._voices.delete(voice);
    } };
    this._voices.add(voice);
    source.onended = voice.stop;
    source.start(at);
    source.stop(at + duration + 0.02);
  }

  play(name, intensity = 1) {
    if (this._paused) return;
    const patterns = { hit: 20, crit: [30, 15, 45], hurt: [35, 20, 65], dash: 10,
      magic: [12, 12, 24], kill: 28, upgrade: [15, 35, 25], win: [30, 50, 50], death: [65, 35, 90], ui: 6,
      block: 12, guardBreak: [25, 20, 55] };
    if (patterns[name]) this.vibrate(patterns[name]);
    const ctx = this.context;
    if (this.muted || !ctx || ctx.state !== 'running') return;
    const amount = Number.isFinite(intensity) ? Math.max(0, Math.min(intensity, 1.6)) : 1;
    if (!amount) return;
    const at = ctx.currentTime + 0.005;
    const tone = (type, frequency, duration, gain, slide, delay = 0) =>
      this._voice(type, frequency, duration, gain * amount, at + delay, slide);
    const notes = (frequencies, speed = 0.09, gain = 0.12) => frequencies.forEach((f, i) => {
      tone('triangle', f, 0.55, gain, f * 0.999, speed * i);
      tone('sine', f * 2, 0.3, gain * 0.3, undefined, speed * i);
    });
    switch (name) {
      case 'swing':
        tone('noise', 3800, 0.12, 0.23, 700);
        tone('triangle', 260, 0.09, 0.09, 95);
        break;
      case 'thrust': // enemy spear: short piercing hiss, narrower and higher than swing; no vibration
        tone('noise', 5200, 0.09, 0.2, 1400);
        tone('triangle', 1250, 0.08, 0.07, 520);
        break;
      case 'hit':
      case 'crit': {
        const critical = name === 'crit';
        tone('noise', critical ? 6500 : 4400, 0.11, 0.43, 700);
        tone('sine', critical ? 145 : 120, 0.2, critical ? 0.55 : 0.43, 42);
        tone('triangle', 1650, 0.13, 0.16, 410);
        tone('sine', 2380, 0.16, 0.045, 1850);
        if (critical) {
          tone('noise', 2200, 0.24, 0.2, 260, 0.035);
          tone('sawtooth', 88, 0.16, 0.09, 36);
        }
        break;
      }
      case 'block': {
        // Inharmonic partials read as metal; random detune keeps spammed blocks from sounding identical.
        const d = 0.96 + Math.random() * 0.08;
        tone('noise', 5200, 0.04, 0.12, 1800);
        tone('sine', 210 * d, 0.08, 0.14, 120);
        tone('square', 1180 * d, 0.08, 0.035, 1110 * d);
        tone('triangle', 1870 * d, 0.12, 0.08, 1800 * d);
        tone('sine', 2960 * d, 0.14, 0.035);
        break;
      }
      case 'guardBreak':
        tone('noise', 6200, 0.34, 0.3, 260);
        tone('sine', 110, 0.45, 0.48, 32);
        tone('sawtooth', 160, 0.24, 0.1, 48);
        [2350, 1720, 3100, 1390].forEach((f, i) => tone('triangle', f, 0.18, 0.07, f * 0.92, 0.025 * (i + 1)));
        notes([147, 220], 0.08, 0.06);
        break;
      case 'hurt':
        tone('sawtooth', 140, 0.25, 0.15, 48);
        tone('noise', 1800, 0.2, 0.3, 180);
        tone('sine', 75, 0.3, 0.36, 35);
        break;
      case 'jump':
        tone('triangle', 140, 0.17, 0.1, 340);
        tone('noise', 650, 0.07, 0.06, 1600);
        break;
      case 'dash':
        tone('noise', 4200, 0.23, 0.2, 320);
        tone('sine', 280, 0.16, 0.1, 65);
        break;
      case 'magic':
        tone('noise', 2400, 0.32, 0.15, 6400);
        tone('sine', 130, 0.45, 0.21, 58);
        notes([330, 494, 659], 0.035, 0.14);
        break;
      case 'kill':
        tone('noise', 1600, 0.32, 0.26, 120);
        tone('sine', 95, 0.35, 0.22, 30);
        notes([392, 587], 0.07, 0.05);
        break;
      case 'upgrade': notes([294, 349, 440, 587], 0.09, 0.15); break;
      case 'portal':
        tone('noise', 900, 0.85, 0.12, 4500);
        notes([147, 220, 294, 440], 0.12, 0.13);
        break;
      case 'win': notes([294, 349, 440, 587, 698, 880], 0.14, 0.14); break;
      case 'death':
        notes([220, 185, 147, 110, 73], 0.18, 0.14);
        tone('noise', 1100, 0.8, 0.15, 100);
        break;
      case 'ui': tone('sine', 740, 0.07, 0.07, 550); break;
    }
  }

  _syncMusic() {
    const active = this.context?.state === 'running' && !this._paused && !this.muted && this.music;
    if (!active) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
      for (const voice of [...this._voices]) if (voice.music) voice.stop();
      return;
    }
    if (this._musicTimer !== null) return;
    this._nextNote = this.context.currentTime + 0.08;
    const schedule = () => {
      if (this.context.state !== 'running') return;
      // Do not replay a backlog after a background tab's timers are throttled.
      if (this._nextNote < this.context.currentTime) this._nextNote = this.context.currentTime + 0.04;
      const chords = [[146.83, 174.61, 220, 293.66], [130.81, 164.81, 196, 261.63],
        [116.54, 146.83, 174.61, 233.08], [110, 138.59, 164.81, 220]];
      while (this._nextNote < this.context.currentTime + 0.3) {
        const chord = chords[Math.floor(this._step / 16) % chords.length];
        const note = chord[[0, 2, 1, 3, 2, 1, 3, 2][this._step % 8]];
        this._voice('triangle', note, 1.2, 0.028, this._nextNote, undefined, true);
        this._voice('sine', note * 2, 1.5, 0.012, this._nextNote, undefined, true);
        if (this._step % 8 === 0) {
          this._voice('sine', chord[0] / 2, 3.7, 0.057, this._nextNote, undefined, true);
          this._voice('triangle', chord[2] / 2, 3.5, 0.022, this._nextNote, undefined, true);
        }
        this._step++;
        this._nextNote += 0.48;
      }
    };
    schedule();
    this._musicTimer = setInterval(schedule, 160);
  }
}