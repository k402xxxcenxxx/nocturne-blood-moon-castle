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
    this._phase = 1;
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

  // Music intensity: 1 = normal, 2-3 = boss phases (faster, extra low layers). Takes effect on the next scheduled note.
  setIntensity(phase) { this._phase = Math.max(1, Math.min(3, phase | 0)); }

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
      roar: [60, 40, 120], bossSlam: [40, 20, 70], bossBurst: [30, 20, 60],
      shatter: 14, bloodFlame: 14,
      block: 12, guardBreak: [25, 20, 55], stagger: [20, 15, 50], perfect: [10, 20, 14], plunge: [40, 25, 70] };
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
      case 'crescent': { // relic wave launch: airy hum with a soft breath; quiet since it fires every third hit
        const d = 0.97 + Math.random() * 0.06;
        tone('noise', 1800, 0.22, 0.07, 700);
        tone('triangle', 330 * d, 0.24, 0.05, 400 * d);
        tone('sine', 660 * d, 0.2, 0.022, 780 * d);
        break;
      }
      case 'beam': { // relic beam launch: bright narrow zing, rising then gone
        const d = 0.97 + Math.random() * 0.06;
        tone('square', 1400 * d, 0.1, 0.03, 3200 * d);
        tone('noise', 7000, 0.08, 0.09, 3000);
        tone('sine', 2800 * d, 0.14, 0.04, 4200 * d);
        break;
      }
      case 'groundWave': // relic ground wave launch: low rumble along the floor
        tone('noise', 500, 0.3, 0.14, 120);
        tone('sine', 75, 0.3, 0.2, 40);
        break;
      case 'vortex': // Eclipse pull: suction, filter closing inward while pitch climbs; plays under 'magic'
        tone('noise', 5000, 0.32, 0.1, 400);
        tone('sine', 90, 0.32, 0.12, 320);
        break;
      case 'dive': // air plunge start: falling whoosh, filter and pitch sweep down; no vibration
        tone('noise', 4200, 0.28, 0.22, 380);
        tone('triangle', 520, 0.26, 0.09, 90);
        break;
      case 'plunge': { // air plunge landing: heavy low thud plus stone crunch; detune avoids repeats
        const d = 0.95 + Math.random() * 0.1;
        tone('sine', 85 * d, 0.38, 0.5, 30);
        tone('noise', 2600, 0.22, 0.34, 180);
        tone('sawtooth', 120 * d, 0.14, 0.09, 40);
        tone('noise', 5000, 0.06, 0.16, 900, 0.02);
        break;
      }
      case 'thrust': // enemy spear: short piercing hiss, narrower and higher than swing; no vibration
        tone('noise', 5200, 0.09, 0.2, 1400);
        tone('triangle', 1250, 0.08, 0.07, 520);
        break;
      case 'lunge': // hero thrust: longer, lower, heavier whoosh than the enemy spear hiss, with a bright blade edge
        tone('noise', 6000, 0.16, 0.24, 900);
        tone('triangle', 900, 0.12, 0.08, 320);
        tone('sine', 190, 0.12, 0.1, 80);
        break;
      case 'perfect': { // perfect dodge: bright metallic ting, short ring; random detune avoids mechanical repeats
        const d = 0.98 + Math.random() * 0.04;
        tone('noise', 7500, 0.03, 0.1, 3000);
        [2637, 3951, 5274].forEach((f, i) => tone('sine', f * d, 0.22 - i * 0.05, 0.1 - i * 0.025));
        tone('triangle', 1760 * d, 0.14, 0.06, 1700 * d);
        break;
      }
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
      case 'stagger': { // posture broken: sharp metallic crack over a low thud, then a ringing shard tail
        const d = 0.97 + Math.random() * 0.06;
        tone('noise', 7000, 0.07, 0.3, 1500);
        tone('sine', 100, 0.28, 0.4, 38);
        [1560, 2340, 3480].forEach((f, i) => tone('square', f * d, 0.1 + i * 0.03, 0.04, f * 0.9 * d));
        tone('triangle', 2150 * d, 0.3, 0.08, 1900 * d, 0.03);
        break;
      }
      case 'shatter': { // frozen enemy bursts: glassy crack, bright shard tinkles, small low thud
        const d = 0.96 + Math.random() * 0.08;
        tone('noise', 8000, 0.09, 0.26, 2500);
        tone('sine', 110, 0.16, 0.3, 50);
        [3136, 4186, 5588].forEach((f, i) => tone('triangle', f * d, 0.14 + i * 0.03, 0.07, f * 0.85 * d, 0.012 * i));
        break;
      }
      case 'bloodFlame': { // burning blood ignites: rising dark whoosh, wet low thump, crackle
        const d = 0.95 + Math.random() * 0.1;
        tone('noise', 700, 0.3, 0.26, 3200);
        tone('sawtooth', 90 * d, 0.28, 0.1, 160 * d);
        tone('sine', 70, 0.22, 0.34, 38);
        tone('noise', 4500, 0.05, 0.1, 1200, 0.1);
        break;
      }
      case 'chain': { // lightning arc: fast zap with a falling buzz, then a spark
        const d = 0.96 + Math.random() * 0.08;
        tone('square', 1800 * d, 0.1, 0.06, 260 * d);
        tone('noise', 7000, 0.12, 0.2, 1500);
        tone('triangle', 2600 * d, 0.05, 0.07, 900, 0.07);
        break;
      }
      case 'tick': { // DoT: very soft ember tick; global cap ~6/s so crowds do not buzz
        if (ctx.currentTime - (this._lastTick ?? -1) < 0.16) return;
        this._lastTick = ctx.currentTime;
        const d = 0.9 + Math.random() * 0.2;
        tone('noise', 2600 * d, 0.03, 0.05, 900);
        tone('sine', 190 * d, 0.04, 0.03, 120);
        break;
      }
      case 'freeze': { // frozen: icy crackle, a few tiny irregular ticks over a high shimmer
        tone('sine', 3900, 0.2, 0.05, 3300);
        [0, 0.035, 0.07, 0.12].forEach((dl, i) => tone('noise', 7500 - i * 700, 0.025, 0.12, 3000, dl + Math.random() * 0.015));
        tone('triangle', 1400, 0.1, 0.05, 700);
        break;
      }
      case 'roar': { // boss phase change: detuned low growl with a falling sweep; intensity 1.3 for phase 3
        const d = 0.97 + Math.random() * 0.06;
        tone('sawtooth', 95 * d, 1.1, 0.16, 48);
        tone('sawtooth', 99 * d, 1.1, 0.12, 50);
        tone('sine', 55, 1.2, 0.4, 28);
        tone('noise', 1400, 1, 0.22, 140);
        break;
      }
      case 'bossSlash': // boss blade: heavier, lower swing
        tone('noise', 3000, 0.2, 0.28, 400);
        tone('sawtooth', 150, 0.18, 0.09, 60);
        break;
      case 'bossSlam': // overhead slam: low impact with stone crunch
        tone('sine', 70, 0.45, 0.5, 28);
        tone('noise', 2200, 0.3, 0.34, 160, 0.03);
        tone('sawtooth', 100, 0.16, 0.08, 38, 0.03);
        break;
      case 'bossCharge': // rush: rising whoosh with a low drive
        tone('noise', 800, 0.5, 0.25, 4200);
        tone('sawtooth', 70, 0.5, 0.12, 190);
        break;
      case 'bossVolley': // projectile release: stacked quick hisses with a hollow thump
        [0, 0.05, 0.1].forEach(dl => tone('noise', 5500, 0.09, 0.16, 1500, dl));
        tone('sine', 120, 0.2, 0.3, 50);
        break;
      case 'bossBurst': // ritual detonation: sudden crack, deep boom, dark choir tail
        tone('noise', 6000, 0.35, 0.34, 200);
        tone('sine', 62, 0.7, 0.5, 26);
        tone('sawtooth', 110, 0.5, 0.09, 55);
        notes([110, 164.81], 0.05, 0.05);
        break;
      case 'bless': // blood priest release: low minor choir swell, slow attack; no vibration
        [110, 130.81, 164.81, 220].forEach((f, i) => {
          const d = 1 + (i % 2 ? 0.004 : -0.004); // slight detune for a choral beat
          tone('sawtooth', f * d, 0.8, 0.05, undefined, i * 0.03);
          tone('sine', f * 2 * d, 0.7, 0.03, undefined, 0.1 + i * 0.03);
        });
        tone('noise', 900, 0.6, 0.05, 2200, 0.05);
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
        // Boss phases: phase 2+ adds a low pulse on every beat pair, phase 3 also a filtered rumble.
        if (this._phase > 1 && this._step % 2 === 0) this._voice('sine', chord[0] / 2, 0.4, 0.045 * (this._phase - 1), this._nextNote, undefined, true);
        if (this._phase > 2 && this._step % 4 === 0) this._voice('noise', 260, 0.9, 0.05, this._nextNote, 90, true);
        this._step++;
        this._nextNote += 0.48 / (1 + 0.14 * (this._phase - 1));
      }
    };
    schedule();
    this._musicTimer = setInterval(schedule, 160);
  }
}