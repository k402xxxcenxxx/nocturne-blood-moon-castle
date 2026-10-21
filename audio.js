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
    this._beating = false; // frenzy heartbeat wanted; the timer only runs while audible
    this._beatTimer = null;
    this._lethal = false; // lethal-debt warning wanted
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
    this._syncBeat();
    this._syncHold();
    this._syncLethal();
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

  // Frenzy heartbeat: a low double thump every 0.7 s, driven by game.js (start on frenzy, stop on end/death/Vigil/title).
  setHeartbeat(on) { this._beating = Boolean(on); this._syncBeat(); }

  _syncBeat() {
    const active = this._beating && this.context?.state === 'running' && !this._paused && !this.muted;
    if (!active) { clearInterval(this._beatTimer); this._beatTimer = null; return; }
    if (this._beatTimer !== null) return;
    const beat = () => {
      const at = this.context.currentTime + 0.01;
      this._voice('sine', 62, 0.2, 0.34, at, 38);
      this._voice('sine', 52, 0.22, 0.24, at + 0.2, 34);
    };
    beat();
    this._beatTimer = setInterval(beat, 700);
  }

  // Delayed-heavy hold: a quiet low creak loop. game.js flips it on edges only; it also dies on pause, mute and suspend.
  setHold(on, kind) { on = on ? (kind || true) : false; if (on === this._holding) return; this._holding = on; this._hold?.(); this._hold = null; this._syncHold(); } // kind: 'rite' chant, 'ray' hum, else creak

  _syncHold() {
    const active = this._holding && this.context?.state === 'running' && !this._paused && !this.muted;
    if (!active) { this._hold?.(); this._hold = null; return; }
    if (this._hold) return;
    const ctx = this.context, now = ctx.currentTime;
    const noise = ctx.createBufferSource(), band = ctx.createBiquadFilter(), tone = ctx.createOscillator(), lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain(), out = ctx.createGain();
    const k = this._holding; // rite: breathy minor chant, slow swell; ray: steady narrow hum
    noise.buffer = this._noiseBuffer; noise.loop = true;
    band.type = 'bandpass'; band.frequency.value = k === 'rite' ? 420 : k === 'ray' ? 1800 : 700; band.Q.value = k === 'ray' ? 12 : 4;
    tone.type = k === 'rite' ? 'triangle' : k === 'ray' ? 'sine' : 'sawtooth'; tone.frequency.value = k === 'rite' ? 156 : k === 'ray' ? 220 : 78;
    lfo.frequency.value = k === 'rite' ? 3.2 : k === 'ray' ? 28 : 9; lfoGain.gain.value = 0.03; // flutter, so the hold reads as strain rather than a drone
    out.gain.setValueAtTime(0.0001, now); out.gain.exponentialRampToValueAtTime(0.06, now + 0.05);
    lfo.connect(lfoGain); lfoGain.connect(out.gain);
    noise.connect(band); band.connect(out); tone.connect(out); out.connect(this._master);
    noise.start(); tone.start(); lfo.start();
    this._hold = () => {
      const end = ctx.currentTime;
      out.gain.cancelScheduledValues(end); out.gain.setTargetAtTime(0.0001, end, 0.015);
      for (const node of [noise, tone, lfo]) { try { node.stop(end + 0.1); } catch { /* Already stopped. */ } }
      setTimeout(() => { for (const node of [noise, band, tone, lfo, lfoGain, out]) node.disconnect(); }, 150);
    };
  }

  // Lethal-debt warning: a quiet fixed-pitch low tone while the pending debt would kill. game.js flips it on edges; it dies on pause, mute and suspend.
  setLethal(on) { on = Boolean(on); if (on === this._lethal) return; this._lethal = on; this._syncLethal(); }

  _syncLethal() {
    const active = this._lethal && this.context?.state === 'running' && !this._paused && !this.muted;
    if (!active) { this._lethalStop?.(); this._lethalStop = null; return; }
    if (this._lethalStop) return;
    const ctx = this.context, now = ctx.currentTime;
    const a = ctx.createOscillator(), b = ctx.createOscillator(), out = ctx.createGain();
    a.type = 'sine'; a.frequency.value = 110; b.type = 'triangle'; b.frequency.value = 165;
    out.gain.setValueAtTime(0.0001, now); out.gain.exponentialRampToValueAtTime(0.05, now + 0.1);
    a.connect(out); b.connect(out); out.connect(this._master);
    a.start(); b.start();
    this._lethalStop = () => {
      const end = ctx.currentTime;
      out.gain.cancelScheduledValues(end); out.gain.setTargetAtTime(0.0001, end, 0.015);
      for (const node of [a, b]) { try { node.stop(end + 0.1); } catch { /* Already stopped. */ } }
      setTimeout(() => { for (const node of [a, b, out]) node.disconnect(); }, 150);
    };
  }

  suspend() {
    this._paused = true;
    this._syncLethal();
    this._syncMusic();
    this._syncBeat();
    this._syncHold();
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
      this._syncBeat();
      this._syncHold();
      this._syncLethal();
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
      magic: [12, 12, 24], kill: 28, upgrade: [15, 35, 25], cursedPick: [20, 30, 35], win: [30, 50, 50], death: [65, 35, 90], ui: 6,
      roar: [60, 40, 120], frenzy: [50, 30, 90, 30, 160], bossSlam: [40, 20, 70], bossBurst: [30, 20, 60],
      shatter: 14, bloodFlame: 14, chestOpen: [12, 20, 18], chestHeal: [12, 20, 18], guardDown: 14,
      woodBreak: 18, altarShatter: [25, 15, 40], eliteKill: [30, 20, 50],
      block: 12, guardBreak: [25, 20, 55], stagger: [30, 20, 70], riposte: [15, 10, 25], perfect: [10, 20, 14], plunge: [40, 25, 70], heavyHit: [90, 40, 160],
      tollDrain: [70, 30, 50, 30, 110], plateShatter: [40, 20, 80], wardenRoar: [60, 40, 120], wardenSlam: [40, 25, 70],
      kingLand: [50, 25, 90], kingTitheEnd: [20, 30, 30], kingRoar: [60, 40, 120],
      hitChop: 14, apexGuard: 10, apexCrush: [30, 20, 60], numbHit: 12, debtPaid: [70, 30, 90], debtLethal: [90, 40, 160], assault: 10, assaultHit: 16, assaultBlock: 12 };
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
      case 'trapWarn': { // telegraph tick, very quiet; global throttle so several traps do not machine-gun
        if (ctx.currentTime - (this._lastWarn ?? -1) < 0.1) return;
        this._lastWarn = ctx.currentTime;
        tone('noise', 3000, 0.025, 0.05, 1200);
        tone('sine', 520, 0.04, 0.035, 380);
        break;
      }
      case 'woodHit': { // barricade struck: dull wooden knock
        const d = 0.9 + Math.random() * 0.2;
        tone('noise', 1800 * d, 0.07, 0.2, 400);
        tone('sine', 150 * d, 0.1, 0.25, 70);
        break;
      }
      case 'stoneHit': { // altar struck: heavy stone tap with a faint dark ring
        const d = 0.92 + Math.random() * 0.16;
        tone('noise', 3200, 0.05, 0.18, 700);
        tone('sine', 95 * d, 0.14, 0.3, 45);
        tone('triangle', 880 * d, 0.12, 0.04, 820 * d);
        break;
      }
      case 'woodBreak': // barricade collapses: crack, splintering clatter, low thud
        tone('noise', 4200, 0.1, 0.3, 900);
        tone('sine', 110, 0.25, 0.35, 45);
        [0.05, 0.09, 0.15, 0.21].forEach((dl, i) => tone('noise', 2400 - i * 300, 0.04, 0.12, 700, dl));
        break;
      case 'altarShatter': // altar bursts, then the traps power down in a falling sweep
        tone('noise', 6500, 0.3, 0.32, 300);
        tone('sine', 80, 0.5, 0.45, 28);
        [2093, 2794, 3520].forEach((f, i) => tone('triangle', f, 0.18, 0.06, f * 0.85, 0.01 * i));
        tone('sawtooth', 330, 0.7, 0.07, 55, 0.15);
        tone('sine', 660, 0.6, 0.05, 90, 0.15);
        break;
      case 'spikeClang': // spikes thrust: sharp metal stab
        tone('noise', 6500, 0.05, 0.14, 2000);
        tone('triangle', 1450, 0.12, 0.06, 1350);
        tone('sine', 220, 0.08, 0.1, 110);
        break;
      case 'gearGrind': // gears: raspy low grind
        tone('sawtooth', 70, 0.25, 0.06, 55);
        tone('noise', 1100, 0.25, 0.1, 500);
        tone('square', 190, 0.1, 0.025, 150);
        break;
      case 'pillarGush': // blood pillar: wet rising gush
        tone('noise', 600, 0.3, 0.14, 2600);
        tone('sine', 80, 0.28, 0.16, 50);
        break;
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
      case 'frenzy': // Blood Frenzy start: deep detuned roar with a wet crack; the heartbeat loop is separate
        tone('sawtooth', 80, 0.9, 0.15, 42);
        tone('sawtooth', 83, 0.9, 0.11, 44);
        tone('sine', 50, 1, 0.42, 26);
        tone('noise', 1200, 0.7, 0.2, 160);
        tone('noise', 5000, 0.08, 0.16, 1200);
        break;
      // Weapon frenzy variants (#61), layered over 'frenzy'; fixed-pitch where they warn, quiet otherwise.
      case 'frenzy_heavy': tone('sine', 40, 0.9, 0.2, 24); tone('noise', 500, 0.5, 0.1, 120); break; // heavier, duller
      case 'frenzy_twin': [0, 0.05, 0.1].forEach((dl, i) => tone('noise', 6500 + i * 800, 0.07, 0.09, 2500, dl)); break; // fast blade hiss
      case 'frenzy_spear': tone('triangle', 520, 0.3, 0.06, 1200); tone('noise', 4500, 0.2, 0.08, 1200); break; // rising lance whine
      case 'twinTick': { // twin auto swing: short, soft, 3-step round robin; throttled so a fast rhythm stays pleasant
        if (ctx.currentTime - (this._lastTwin ?? -1) < 0.07) return;
        this._lastTwin = ctx.currentTime;
        const k = [0.97, 1, 1.03][this._twinStep = ((this._twinStep ?? 0) + 1) % 3];
        tone('noise', 4600 * k, 0.07, 0.11, 1300);
        tone('triangle', 330 * k, 0.05, 0.04, 160);
        break;
      }
      case 'numbHit': // Greatsword frenzy hit taken: muffled dull thud, no bite, nothing high
        tone('sine', 70, 0.22, 0.3, 40);
        tone('noise', 450, 0.18, 0.18, 120);
        break;
      case 'debtPaid': // the numbness breaks: sharp gasp, then a heavy low thud
        tone('noise', 1800, 0.3, 0.2, 500);
        tone('sine', 60, 0.55, 0.45, 24, 0.06);
        tone('sawtooth', 95, 0.3, 0.08, 40, 0.06);
        tone('triangle', 240, 0.2, 0.1, 100, 0.06);
        break;
      case 'debtLethal': // as debtPaid, then the tone falls away and nothing answers
        tone('noise', 1800, 0.3, 0.2, 500);
        tone('sine', 60, 0.8, 0.45, 20, 0.06);
        tone('triangle', 240, 0.25, 0.1, 100, 0.06);
        tone('sine', 220, 0.9, 0.1, 55, 0.15);
        break;
      case 'assault': // spear frenzy dash: longer, lower whoosh with a bright lance edge
        tone('noise', 5200, 0.26, 0.2, 380);
        tone('triangle', 1100, 0.14, 0.07, 360);
        tone('sine', 220, 0.2, 0.1, 70);
        break;
      case 'assaultHit': { // lance lands: sharp pierce over a thud
        const d = 0.96 + Math.random() * 0.08;
        tone('noise', 5000, 0.08, 0.3, 900);
        tone('sine', 110 * d, 0.2, 0.4, 40);
        tone('triangle', 1500 * d, 0.1, 0.1, 500);
        break;
      }
      case 'assaultBlock': { // blocked lance: distinct heavy clang, lower and longer than 'block'
        const d = 0.97 + Math.random() * 0.06;
        tone('noise', 4200, 0.05, 0.14, 1500);
        tone('sine', 150 * d, 0.14, 0.2, 90);
        [820, 1330, 2210].forEach((f, i) => tone('triangle', f * d, 0.28 - i * 0.06, 0.08, f * d * 0.99));
        break;
      }
      case 'frenzyEnd': // exhale: breath falling away, a sinking tone
        tone('noise', 1500, 0.7, 0.14, 180);
        tone('sine', 150, 0.6, 0.2, 48);
        tone('triangle', 300, 0.5, 0.05, 110);
        break;
      case 'bloodHalf': // meter crosses 50% upward: two low rising notes
        tone('triangle', 196, 0.3, 0.08, 195);
        tone('triangle', 294, 0.4, 0.08, 293, 0.09);
        tone('sine', 98, 0.3, 0.12, 80);
        break;
      case 'bloodGain': { // intensity = 0.3 + fill * 1.2; pitch climbs two octaves-ish with fill; throttled for combos
        if (ctx.currentTime - (this._lastGain ?? -1) < 0.09) return;
        this._lastGain = ctx.currentTime;
        const f = 300 * 2 ** ((amount - 0.3) / 1.2 * 1.2);
        tone('sine', f, 0.07, 0.07, f * 1.05);
        tone('noise', 2000, 0.03, 0.03, 900);
        break;
      }
      case 'vigil': // rest point chime: slow minor bell, calm
        [440, 523.25, 659.25].forEach((f, i) => {
          tone('sine', f, 1.1, 0.08, undefined, i * 0.12);
          tone('sine', f * 2.76, 0.5, 0.02, undefined, i * 0.12);
        });
        tone('sine', 110, 1, 0.14, 100);
        break;
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
      case 'chestOpen': { // intensity 1 = plain chest, ~1.25 = optional (richer: extra high partial and longer tail)
        const d = 0.98 + Math.random() * 0.04, rich = amount > 1.1;
        tone('noise', 3500, 0.05, 0.05, 1200); // latch click
        if (rich) tone('sine', 1760 * d, 0.5, 0.05, undefined, 0.2);
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          tone('triangle', f * d, rich ? 0.5 : 0.35, 0.07, f * d * 0.999, 0.04 + i * 0.065);
          tone('sine', f * 2 * d, 0.2, 0.02, undefined, 0.04 + i * 0.065);
        });
        break;
      }
      case 'chestHeal': { // warm soft swell: slow-attack low-mid sines, no sparkle
        const d = 0.98 + Math.random() * 0.04, rich = amount > 1.1;
        [220, 277.18, 329.63].forEach((f, i) => {
          tone('sine', f * d, rich ? 0.9 : 0.7, 0.09, undefined, i * 0.05);
          tone('triangle', f * 2 * d, 0.5, 0.025, undefined, 0.08 + i * 0.05);
        });
        tone('noise', 1200, 0.35, 0.03, 2400, 0.03);
        break;
      }
      case 'guardDown': { // progress sting; last guard (intensity 1.4) adds a lifted fifth and a low gate-unlock thud
        const d = 0.98 + Math.random() * 0.04, last = amount > 1.2;
        tone('sine', 98 * d, 0.2, 0.2, 55);
        tone('triangle', 392 * d, 0.2, 0.07, 380 * d, 0.03);
        tone('sine', 784 * d, 0.16, 0.03, undefined, 0.03);
        if (last) {
          tone('triangle', 587.33, 0.4, 0.08, undefined, 0.12);
          tone('sine', 1174.7, 0.3, 0.03, undefined, 0.12);
          tone('sine', 55, 0.5, 0.3, 30, 0.12);
        }
        break;
      }
      case 'hurt':
        tone('sawtooth', 140, 0.25, 0.15, 48);
        tone('noise', 1800, 0.2, 0.3, 180);
        tone('sine', 75, 0.3, 0.36, 35);
        break;
      case 'heavyWarn': { // heavy wind-up cue: two rising dissonant bell strikes plus a low swell; mid/high partials carry on phone speakers
        const d = 0.98 + Math.random() * 0.04;
        tone('sawtooth', 110, 0.55, 0.1, 190, 0);
        tone('noise', 600, 0.5, 0.1, 3000);
        [0, 0.16].forEach((dl, i) => {
          tone('triangle', (i ? 988 : 880) * d, 0.3, 0.14, undefined, dl);
          tone('square', (i ? 1480 : 1245) * d, 0.12, 0.035, undefined, dl);
          tone('sine', 55 * (i + 1), 0.25, 0.22, undefined, dl);
        });
        break;
      }
      // Castle enemy tells (#50): one cue per move, mid/high and short so they read over a fight; none shares a shape with swing or heavyWarn.
      case 'tellSlash': // skeleton/knight slash: two dry bone clicks climbing
        tone('noise', 4800, 0.025, 0.12, 2200);
        tone('triangle', 700, 0.07, 0.08, 980);
        tone('noise', 5600, 0.025, 0.12, 2600, 0.06);
        tone('triangle', 940, 0.08, 0.08, 1300, 0.06);
        break;
      case 'tellStepcut': // skeleton stepcut: falling scrape (the backstep) then a sharp rising tsk
        tone('noise', 3200, 0.14, 0.1, 500);
        tone('sine', 420, 0.14, 0.07, 210);
        tone('square', 1500, 0.07, 0.04, 2400, 0.15);
        tone('noise', 6500, 0.04, 0.1, 3000, 0.15);
        break;
      case 'tellBash': // shield bash: dull armoured clunk with a short grind
        tone('sine', 170, 0.12, 0.2, 100);
        tone('square', 430, 0.09, 0.04, 380);
        tone('noise', 1300, 0.13, 0.12, 400);
        break;
      case 'tellCounter': // shield counter: ringing shield rim, brighter and longer than bash so the shove is known early
        [1180, 1870, 2960].forEach((f, i) => tone('sine', f, 0.3 - i * 0.05, 0.07, f * 1.02));
        tone('triangle', 590, 0.2, 0.07, 700);
        tone('noise', 5200, 0.03, 0.08, 2000);
        break;
      case 'tellGeneric': // other moves (swoop, thrust, bolt) until they get their own: soft rising blip
        tone('triangle', 620, 0.1, 0.08, 940);
        tone('noise', 3400, 0.07, 0.07, 1500);
        break;
      case 'tellSwoop': // bat dart: one short sharp high squeak-flick (0.25 s lead), no low content; fixed pitch
        tone('square', 1900, 0.06, 0.05, 2900);
        tone('noise', 6400, 0.05, 0.1, 3200);
        break;
      case 'tellThrust': // spearman thrust: spear levelled, a metallic slide up into a single hard tick
        tone('noise', 3600, 0.1, 0.09, 6000);
        tone('triangle', 800, 0.1, 0.07, 1500);
        tone('square', 2100, 0.03, 0.04, 2100, 0.1);
        break;
      case 'tellLow': // spearman low sweep ("jump"): dark low scrape with a falling thump, nothing bright, apart from tellSweep
        tone('noise', 700, 0.18, 0.1, 250);
        tone('sine', 190, 0.18, 0.2, 90);
        tone('sawtooth', 120, 0.12, 0.05, 70, 0.06);
        break;
      case 'tellOverhead': // knight overhead chop: sword hoisted, rising plate clank then a held metal ring
        tone('noise', 2600, 0.12, 0.1, 900);
        tone('triangle', 330, 0.16, 0.09, 620);
        tone('sine', 1320, 0.2, 0.04, 1320, 0.08);
        break;
      case 'tellTurnswipe': // knight turnswipe: plate wheel, a short falling whoosh and a low rising creak
        tone('noise', 2200, 0.16, 0.1, 600);
        tone('sawtooth', 160, 0.16, 0.05, 300);
        tone('triangle', 540, 0.08, 0.06, 420, 0.1);
        break;
      case 'knightCommit': // knight string follow-up chosen: one dull plate knock, higher and single against kingCommit's low double
        tone('sine', 250, 0.1, 0.2, 160);
        tone('noise', 1500, 0.06, 0.1, 500);
        break;
      case 'batWing': { // bat crossover: soft leathery flaps over a thin whoosh; quiet, detuned
        const d = 0.94 + Math.random() * 0.12;
        tone('noise', 1400 * d, 0.3, 0.07, 2600);
        [0, 0.09, 0.18].forEach(dl => tone('triangle', 240 * d, 0.07, 0.05, 150 * d, dl));
        break;
      }
      case 'hitSweep': // spearman low sweep contact: low floor whip and thump
        tone('noise', 1800, 0.12, 0.2, 300);
        tone('sine', 110, 0.14, 0.24, 55);
        break;
      case 'hitChop': { // knight overhead contact: heavy blade into stone, thud and a short ring
        const d = 0.96 + Math.random() * 0.08;
        tone('sine', 80 * d, 0.22, 0.32, 38);
        tone('noise', 3000, 0.1, 0.22, 400);
        tone('triangle', 880 * d, 0.12, 0.05, 840 * d);
        break;
      }
      case 'hitClaw': { // bat claw rake: two quick high scratches
        const d = 0.96 + Math.random() * 0.08;
        tone('noise', 6800 * d, 0.05, 0.14, 3000);
        tone('noise', 5800 * d, 0.05, 0.12, 2600, 0.05);
        break;
      }
      case 'hitTurnswipe': // knight turnswipe contact: quick wide metal swish
        tone('noise', 3400, 0.14, 0.2, 800);
        tone('triangle', 420, 0.1, 0.08, 200);
        break;
      // Apex skeleton cues (#66, castle only). Tells are fixed pitch; rising climbs, counter rings low and flat, chain double-ticks.
      case 'tellRising': // rising slash (anti-air): a steep upward bone-and-steel sweep, higher and longer than tellSlash's two clicks
        tone('noise', 2400, 0.22, 0.1, 7000);
        tone('triangle', 500, 0.22, 0.09, 1800);
        tone('sine', 2400, 0.1, 0.04, 3200, 0.16);
        break;
      case 'tellApexCounter': // counter after a guard: a held low bony knock, flat pitch, nothing climbing
        tone('sine', 240, 0.16, 0.18, 200);
        tone('square', 780, 0.05, 0.04, 760);
        tone('noise', 2200, 0.05, 0.1, 900, 0.1);
        tone('sine', 240, 0.1, 0.14, 190, 0.12);
        break;
      case 'tellChain': // chain lunge: a quick rattle of three ticks then a short low scrape, "it is coming again"
        [0, 0.05, 0.1].forEach(dl => tone('noise', 4600, 0.025, 0.1, 2200, dl));
        tone('triangle', 1100, 0.12, 0.06, 1500, 0.15);
        tone('noise', 1400, 0.1, 0.07, 500, 0.15);
        break;
      case 'apexGuard': { // block clank: bone-white blade on iron; intensity 1 = guarded hit, lower = parried air
        const d = 0.96 + Math.random() * 0.08;
        tone('noise', 5600, 0.05, 0.16, 1700);
        tone('sine', 190 * d, 0.1, 0.16, 110);
        tone('square', 1320 * d, 0.1, 0.04, 1250 * d);
        tone('triangle', 2100 * d, 0.2, 0.07, 2040 * d);
        break;
      }
      case 'apexCrush': { // guard breaks: heavy crack, falling shard cascade, low thud (satisfying, under guardBreak's weight)
        const d = 0.97 + Math.random() * 0.06;
        tone('noise', 6800, 0.2, 0.28, 400);
        tone('sine', 100 * d, 0.32, 0.42, 36);
        [2600, 1900, 3300, 1500].forEach((f, i) => tone('triangle', f * d, 0.16, 0.06, f * 0.88 * d, 0.03 * i));
        tone('square', 700, 0.08, 0.04, 300, 0.02);
        break;
      }
      case 'apexStep': { // quiet backstep: bone scrape over a soft pat; throttled and detuned
        if (ctx.currentTime - (this._lastApexStep ?? -1) < 0.1) return;
        this._lastApexStep = ctx.currentTime;
        const d = 0.9 + Math.random() * 0.2;
        tone('noise', 2000 * d, 0.12, 0.06, 600);
        tone('sine', 150 * d, 0.07, 0.08, 95);
        break;
      }
      // Castle priest / mage / elite cues. Tells are fixed pitch; the two bolt casters and each elite twist get their own sound.
      case 'tellBoltPriest': // priest bolt: low breathy intone with a dull rising hiss
        tone('sine', 196, 0.2, 0.12, 233);
        tone('noise', 900, 0.14, 0.06, 1800);
        break;
      case 'tellBoltMage': // mage bolt: thin electric crackle, bright and short
        tone('square', 1500, 0.07, 0.05, 2400);
        tone('noise', 5000, 0.1, 0.09, 2500);
        tone('triangle', 900, 0.08, 0.05, 1300, 0.05);
        break;
      case 'tellSlash2': // duelist second strike: a quick lighter double whisk
        tone('noise', 3200, 0.07, 0.1, 1400);
        tone('noise', 3800, 0.07, 0.1, 1700, 0.07);
        break;
      case 'tellRite': // priest rite: a falling bell-tone under a low minor drone (the chant hold follows)
        tone('sine', 262, 0.4, 0.12, 247);
        tone('triangle', 156, 0.4, 0.09, 147);
        tone('sine', 1047, 0.3, 0.03, 1040, 0.04);
        break;
      case 'tellRay': // mage ray: a rising charged whine
        tone('sawtooth', 220, 0.45, 0.06, 880);
        tone('sine', 1760, 0.4, 0.04, 2640);
        break;
      case 'tellSkewer': // impaler skewer: slow metal draw back, a ratchet tick
        tone('noise', 2400, 0.22, 0.09, 4200);
        tone('triangle', 520, 0.2, 0.07, 780);
        [0.1, 0.17].forEach(dl => tone('square', 1700, 0.02, 0.04, 1700, dl));
        break;
      case 'tellBounce': // shrieker dive that will strike again: a sharp shriek with a second chirp
        tone('sawtooth', 2200, 0.1, 0.05, 3000);
        tone('square', 2700, 0.06, 0.04, 3400, 0.11);
        tone('noise', 6000, 0.08, 0.08, 3000);
        break;
      case 'mageShimmer': // mage blink start: glassy shimmer climbing
        tone('sine', 1320, 0.3, 0.05, 2640);
        tone('sine', 1760, 0.3, 0.04, 3520, 0.05);
        tone('noise', 7000, 0.28, 0.05, 4000);
        break;
      case 'mageBlink': // mage lands: a soft airy pop
        tone('sine', 520, 0.08, 0.14, 160);
        tone('noise', 4200, 0.1, 0.1, 900);
        break;
      case 'priestStep': // priest backstep: soft cloth drag and a low pat
        tone('noise', 1200, 0.14, 0.07, 500);
        tone('sine', 130, 0.08, 0.1, 85);
        break;
      case 'hierophant': // posture blessing: warm bright upper fifth over a low root
        tone('sine', 523, 0.5, 0.08, 523);
        tone('sine', 784, 0.5, 0.06, 784, 0.06);
        tone('triangle', 262, 0.5, 0.06, 262);
        break;
      // Gate Warden cues. Tells are fixed pitch (no detune); impacts and footfalls detune a little so they do not repeat.
      case 'tellSweep': // wide arm drawn back: low scrape rising into a dull stone knock; lower and slower than tellSlash
        tone('noise', 900, 0.2, 0.1, 2200);
        tone('sawtooth', 150, 0.2, 0.06, 260);
        tone('square', 520, 0.07, 0.04, 560, 0.2);
        break;
      case 'tellBackhand': // reverse snap: quick falling whip then a hard double tick, reads as "behind you"
        tone('noise', 4200, 0.1, 0.12, 700);
        tone('triangle', 880, 0.1, 0.07, 340);
        tone('noise', 3200, 0.03, 0.1, 1400, 0.11);
        tone('square', 640, 0.05, 0.04, 600, 0.11);
        break;
      case 'wardenRattle': // seize tell: gauntlet chain rattling, a burst of irregular metal ticks over a low drag; fixed pitch
        [0, 0.05, 0.1, 0.17, 0.23, 0.31].forEach((dl, i) => {
          tone('noise', 5200 - (i % 3) * 600, 0.03, 0.09, 1800, dl);
          tone('square', 1320 + (i % 2) * 310, 0.04, 0.025, 1200, dl);
        });
        tone('sawtooth', 90, 0.4, 0.05, 70);
        break;
      case 'wardenSeize': // gauntlet clamps shut: iron clang over a crushing low squeeze
        tone('noise', 6000, 0.06, 0.25, 1200);
        tone('sine', 120, 0.3, 0.38, 45);
        [740, 1110, 1630].forEach((f, i) => tone('square', f, 0.2 - i * 0.04, 0.035, f * 0.97));
        tone('sawtooth', 70, 0.35, 0.08, 40);
        break;
      case 'wardenStep': { // footfall: dull stone thud; intensity 1.3 = charge stride (heavier, shorter gap)
        if (ctx.currentTime - (this._lastStep ?? -1) < 0.08) return;
        this._lastStep = ctx.currentTime;
        const d = 0.9 + Math.random() * 0.2;
        tone('sine', 62 * d, 0.2, 0.32, 30);
        tone('noise', 700 * d, 0.1, 0.12, 150);
        break;
      }
      case 'wardenSkid': // charge ends: stone dragged and ground to a halt
        tone('noise', 2400, 0.4, 0.2, 250);
        tone('sawtooth', 110, 0.35, 0.07, 45);
        tone('sine', 58, 0.3, 0.28, 28, 0.05);
        break;
      case 'wardenSlam': { // maul on the floor: deeper and longer than plunge, with a falling crack and rubble tail
        const d = 0.96 + Math.random() * 0.08;
        tone('sine', 52 * d, 0.6, 0.5, 22);
        tone('noise', 1800, 0.4, 0.34, 120);
        tone('sawtooth', 85 * d, 0.2, 0.09, 34);
        tone('noise', 5200, 0.07, 0.18, 800, 0.01);
        [0.12, 0.2, 0.3].forEach((dl, i) => tone('noise', 2000 - i * 400, 0.05, 0.09, 500, dl));
        break;
      }
      case 'stoneCrack': { // armorChip: brittle stone crack, short and dry (plays often)
        const d = 0.94 + Math.random() * 0.12;
        tone('noise', 4800, 0.05, 0.18, 1200);
        tone('sine', 140 * d, 0.1, 0.2, 70);
        tone('square', 1700 * d, 0.04, 0.03, 1300 * d);
        break;
      }
      case 'plateShatter': // armorBreak: heavy crack, plates cascading down, a low thud
        tone('noise', 6500, 0.3, 0.3, 300);
        tone('sine', 90, 0.4, 0.42, 34);
        [0, 0.05, 0.09, 0.14, 0.2, 0.27].forEach((dl, i) => tone('noise', 3600 - i * 350, 0.05, 0.1, 700, dl + 0.04));
        [1480, 2200, 1170].forEach((f, i) => tone('triangle', f, 0.16, 0.05, f * 0.88, 0.02 * i));
        break;
      case 'armorForm': // armorRestore: stone grinding back together, rising scrape and a settling thud
        tone('noise', 600, 0.45, 0.14, 2200);
        tone('sawtooth', 70, 0.45, 0.07, 130);
        tone('sine', 70, 0.2, 0.28, 36, 0.42);
        tone('noise', 2000, 0.06, 0.1, 500, 0.42);
        break;
      case 'tollDrain': // Gate Toll: wet pull as blood is torn out, three descending gulps and a dark thump
        tone('noise', 800, 0.4, 0.2, 3000);
        [0, 0.12, 0.25].forEach((dl, i) => tone('sine', 220 - i * 45, 0.14, 0.2, 90 - i * 15, dl));
        tone('sine', 55, 0.5, 0.4, 26, 0.05);
        tone('sawtooth', 100, 0.35, 0.07, 45);
        break;
      case 'poolSplash': // bloodPool: small wet slap
        tone('noise', 1500, 0.12, 0.16, 300);
        tone('sine', 200, 0.1, 0.15, 90);
        break;
      case 'poolGulp': // poolTaken: warm quick gulp, rising bubble, nothing bright
        tone('sine', 150, 0.12, 0.2, 260);
        tone('sine', 230, 0.1, 0.12, 400, 0.08);
        tone('noise', 900, 0.1, 0.05, 2000, 0.02);
        break;
      case 'wardenRoar': { // phase 2: Warden roar, the boss roar plus a stone grind and a second low detuned voice
        const d = 0.97 + Math.random() * 0.06;
        tone('sawtooth', 80 * d, 1.3, 0.16, 38);
        tone('sawtooth', 84 * d, 1.3, 0.12, 40);
        tone('sine', 46, 1.4, 0.4, 24);
        tone('noise', 1000, 1.2, 0.22, 100);
        tone('square', 190, 0.5, 0.03, 90, 0.1);
        [0.1, 0.3, 0.55].forEach((dl, i) => tone('noise', 2400 - i * 500, 0.06, 0.12, 600, dl));
        break;
      }
      // Fallen King cues (castle floor 50): regal and crimson (bell, brass-like saws, plate and cloth), against the Warden's stone and iron. Tells are fixed pitch.
      case 'kingTellSlash': // opening slash: blade drawn, a short metallic ring over a dry scrape
        tone('noise', 4200, 0.16, 0.1, 1800);
        tone('triangle', 1040, 0.22, 0.07, 1000);
        tone('sine', 2090, 0.16, 0.025, 2060);
        break;
      case 'kingTellString': // string second hit, still neutral: a low held hum with a cloth rustle, no pitch to read
        tone('triangle', 233, 0.3, 0.07, 233);
        tone('noise', 1200, 0.25, 0.05, 900);
        break;
      case 'kingTellTurn': // turnslash: the spin, a whoosh that rises then falls with two answering tones
        tone('noise', 1500, 0.3, 0.11, 3200);
        tone('noise', 3200, 0.2, 0.08, 700, 0.14);
        tone('triangle', 520, 0.15, 0.07, 780);
        tone('triangle', 780, 0.15, 0.07, 440, 0.15);
        break;
      case 'kingTellSlam': // slam: a dark bell struck once, inharmonic partials
        [196, 293.66, 531].forEach((f, i) => tone('sine', f, 0.5 - i * 0.12, 0.13 - i * 0.03, f * 0.99));
        tone('sine', 98, 0.4, 0.2, 90);
        break;
      case 'kingTellCharge': // charge: brass-like growl climbing, with wind pulled in
        tone('sawtooth', 90, 0.4, 0.09, 230);
        tone('sawtooth', 94, 0.4, 0.07, 240);
        tone('noise', 700, 0.4, 0.09, 2800);
        break;
      case 'kingTellDescent': // descent: a thin rising cry and cloth flutter, he is leaving the floor
        tone('sine', 330, 0.5, 0.1, 990);
        tone('triangle', 660, 0.5, 0.04, 1500);
        [0, 0.08, 0.16, 0.24, 0.32].forEach((dl, i) => tone('noise', 2400 + i * 300, 0.04, 0.07, 1400, dl));
        break;
      case 'kingTellVolley': // volley: five quick rising hollow blips, one per orb
        [0, 0.04, 0.08, 0.12, 0.16].forEach((dl, i) => tone('sine', 660 + i * 110, 0.07, 0.08, 800 + i * 110, dl));
        tone('noise', 3600, 0.1, 0.05, 1600);
        break;
      case 'kingTellRitual': // ritual: three low pulses of a choir (one per disc), slow and dark
        [0, 0.17, 0.34].forEach((dl, i) => {
          tone('sawtooth', 147 + i * 25, 0.22, 0.06, undefined, dl);
          tone('sine', 294 + i * 50, 0.2, 0.04, undefined, dl);
        });
        tone('noise', 900, 0.5, 0.05, 2000);
        break;
      case 'kingCommit': // string branch chosen at the second glint: a low double knock under the shared shing, nothing above 700 Hz
        tone('sine', 150, 0.12, 0.26, 90, 0.07);
        tone('triangle', 300, 0.1, 0.1, 200, 0.07);
        tone('sine', 190, 0.14, 0.22, 110, 0.15);
        break;
      case 'kingCharge': // charge release: plate-clad rush, rising whoosh with a brassy drive (not the Warden's silence)
        tone('noise', 900, 0.45, 0.22, 3800);
        tone('sawtooth', 80, 0.45, 0.1, 210);
        tone('triangle', 400, 0.3, 0.06, 900);
        break;
      case 'kingLeap': // descent leap: cloth and wind, a rising whoosh that cuts off
        tone('noise', 1200, 0.3, 0.2, 5200);
        tone('triangle', 200, 0.28, 0.08, 520);
        break;
      case 'kingLand': { // descent landing: a heavy plate crash with a low boom and a dark bell ring-out; his own, apart from bossSlam
        const d = 0.96 + Math.random() * 0.08;
        tone('sine', 60 * d, 0.55, 0.5, 24, 0.1);
        tone('noise', 3200, 0.3, 0.3, 200, 0.1);
        tone('noise', 6500, 0.08, 0.16, 1500, 0.1);
        tone('sine', 196, 0.6, 0.1, 190, 0.12);
        tone('sine', 311, 0.45, 0.05, 305, 0.12);
        break;
      }
      case 'kingVolley': // volley release: five bright hisses fanned out, a soft red thump
        [0, 0.03, 0.06, 0.09, 0.12].forEach((dl, i) => tone('noise', 6200 - i * 500, 0.07, 0.1, 2000, dl));
        tone('sine', 100, 0.18, 0.28, 48);
        break;
      case 'kingRitual': // ritual discs erupt: sharp crack, three staggered booms, choir tail
        [0, 0.06, 0.12].forEach((dl, i) => {
          tone('sine', 70 - i * 6, 0.4, 0.3, 28, dl);
          tone('noise', 4000 - i * 700, 0.14, 0.17, 300, dl);
        });
        notes([146.83, 220], 0.05, 0.05);
        break;
      case 'kingStep': { // footfall: plate clink over a muffled thud; lighter and more metallic than the Warden's stone
        if (ctx.currentTime - (this._lastStep ?? -1) < 0.08) return;
        this._lastStep = ctx.currentTime;
        const d = 0.9 + Math.random() * 0.2;
        tone('sine', 78 * d, 0.16, 0.26, 36);
        tone('noise', 3000 * d, 0.05, 0.09, 1400);
        tone('square', 1100 * d, 0.04, 0.02, 900);
        break;
      }
      case 'kingSkid': // charge ends: metal dragged across stone, a bright rasp dying into a thud
        tone('noise', 4200, 0.35, 0.18, 600);
        tone('square', 900, 0.3, 0.03, 300);
        tone('sine', 64, 0.25, 0.26, 30, 0.08);
        break;
      case 'kingRoar': { // phase 2 (1) and 3 (1.3): brass-like swell and fall over a tolled bell, not stone; 3 adds a dissonant upper voice
        const d = 0.97 + Math.random() * 0.06;
        tone('sawtooth', 110 * d, 1.2, 0.14, 55);
        tone('sawtooth', 165 * d, 1.1, 0.07, 82);
        tone('sine', 52, 1.3, 0.4, 26);
        tone('noise', 1600, 1, 0.16, 200);
        [0, 0.35].forEach(dl => [196, 293.66, 415.3].forEach((f, i) => tone('sine', f, 0.7, 0.07 - i * 0.015, f * 0.99, 0.1 + dl)));
        if (amount > 1.2) tone('sawtooth', 233 * d, 1, 0.06, 117);
        break;
      }
      case 'kingTitheStart': // Tithe stream starts: a thin wet pull rising toward him
        tone('noise', 700, 0.5, 0.1, 2400);
        tone('sine', 140, 0.5, 0.1, 260);
        break;
      case 'kingTitheEnd': // pool swallowed: two low gulps, then plate tightening with a short metal ring
        [0, 0.1].forEach((dl, i) => tone('sine', 190 - i * 40, 0.12, 0.2, 80, dl));
        tone('noise', 2600, 0.2, 0.12, 700, 0.18);
        tone('triangle', 620, 0.25, 0.07, 600, 0.2);
        tone('sine', 70, 0.2, 0.26, 34, 0.2);
        break;
      case 'kingTitheCut': // stream cut by the hero: a quick snip, noise falling and a dropped tone
        tone('noise', 5000, 0.08, 0.15, 800);
        tone('sine', 420, 0.12, 0.1, 140);
        break;
      case 'kingMoonPool': // Blood Moon pool: low red chime that wavers, an ominous sting over the splash
        tone('sine', 98, 0.7, 0.2, 94);
        tone('sine', 146.83, 0.7, 0.1, 140);
        tone('sine', 311, 0.5, 0.04, 300, 0.05);
        break;
      case 'glint': // THE timing cue, 0.4 s before a heavy lands: fixed pitch (no detune), rising bright swish into two high partials
        tone('noise', 3000, 0.16, 0.2, 9000);
        tone('sine', 4186, 0.24, 0.17, 4100);
        tone('sine', 6272, 0.18, 0.1, 6100, 0.012);
        tone('triangle', 2093, 0.14, 0.09, 2300);
        break;
      case 'riposte': { // accent over the normal hit: gold double chime and a low snap
        const d = 0.98 + Math.random() * 0.04;
        tone('triangle', 1568 * d, 0.22, 0.12, 1560 * d);
        tone('triangle', 2349 * d, 0.3, 0.1, 2340 * d, 0.05);
        tone('sine', 95, 0.18, 0.3, 45);
        break;
      }
      case 'heavyWhoosh': // heavy strike swing: long low whoosh, heavier than swing
        tone('noise', 2400, 0.3, 0.26, 260);
        tone('sawtooth', 130, 0.28, 0.09, 45);
        break;
      case 'heavyHit': // heavy blow lands: deep boom and stone crunch; layered over hurt
        tone('sine', 55, 0.6, 0.5, 24);
        tone('noise', 2000, 0.35, 0.34, 150);
        tone('sawtooth', 90, 0.3, 0.1, 36);
        tone('triangle', 240, 0.2, 0.12, 100); // mid thump for phone speakers
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
      case 'eliteDrone': // elite sighted: ~1 s detuned low swell with a dark breath, slow attack via delayed layers; no vibration
        tone('sawtooth', 55, 1.1, 0.07, 52);
        tone('sawtooth', 56.5, 1.1, 0.06, 53);
        tone('sine', 41, 1.2, 0.2, 36);
        tone('noise', 300, 0.9, 0.06, 900, 0.1);
        tone('sawtooth', 220, 1.0, 0.035, 205, 0.05); // mid layer for phone speakers
        tone('sawtooth', 226, 1.0, 0.03, 210, 0.05);
        tone('triangle', 330, 0.9, 0.03, 310, 0.1);
        break;
      case 'eliteKill': { // heavier than kill: deep boom and crunch, then a rising minor-third tail
        const d = 0.97 + Math.random() * 0.06;
        tone('noise', 2200, 0.4, 0.3, 120);
        tone('sine', 80 * d, 0.5, 0.4, 26);
        tone('sawtooth', 110 * d, 0.3, 0.07, 45);
        tone('triangle', 260 * d, 0.25, 0.12, 120); // mid thump for phone speakers
        [294, 349, 440, 587].forEach((f, i) => tone('triangle', f * d, 0.5, 0.06, f * d * 0.999, 0.12 + i * 0.08));
        break;
      }
      case 'upgrade': notes([294, 349, 440, 587], 0.09, 0.15); break;
      case 'cursedPick': // low minor stab (A1 + C2 + E2) with a dark fading tail
        tone('sawtooth', 55, 0.5, 0.1, 50);
        tone('triangle', 65.4, 0.6, 0.12, 60);
        tone('sine', 82.4, 0.7, 0.12, 74);
        tone('triangle', 165, 0.35, 0.05, 150); // mid body for phone speakers
        tone('noise', 500, 0.6, 0.05, 90, 0.08);
        break;
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