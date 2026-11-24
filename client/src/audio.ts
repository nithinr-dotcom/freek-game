/** Synthesised WebAudio sound effects (no audio files). */
import type { Tier } from "@freek/shared";
import { TIERS } from "@freek/shared";

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private rainNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  muted = localStorage.getItem("tb_muted") === "1";
  volume = 0.8;
  private get gainValue() { return this.muted ? 0 : this.volume * 0.7; }
  setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); if (this.master) this.master.gain.value = this.gainValue; }

  /** call from a user gesture */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.gainValue;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }
  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem("tb_muted", this.muted ? "1" : "0");
    if (this.master) this.master.gain.value = this.gainValue;
    return this.muted;
  }
  private get ok() { return !!this.ctx && !!this.master && this.ctx.state === "running"; }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; delay?: number; slide?: number; attack?: number } = {}) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime + (opts.delay ?? 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = opts.type ?? "sine";
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
    const v = opts.vol ?? 0.3, a = opts.attack ?? 0.01;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private noise(dur: number, opts: { vol?: number; delay?: number; type?: BiquadFilterType; freq?: number; freqEnd?: number; q?: number; attack?: number } = {}) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime + (opts.delay ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = opts.type ?? "lowpass";
    f.frequency.setValueAtTime(opts.freq ?? 1200, t);
    if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + dur);
    f.Q.value = opts.q ?? 0.8;
    const g = c.createGain();
    const v = opts.vol ?? 0.3, a = opts.attack ?? 0.01;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  splash(size = 1) {
    this.noise(0.5 * size, { vol: 0.35, type: "bandpass", freq: 1800, freqEnd: 300, q: 0.6 });
    this.tone(320, 0.15, { type: "sine", vol: 0.1, slide: 0.4 });
  }
  cast() { this.noise(0.35, { vol: 0.15, type: "highpass", freq: 2500, freqEnd: 900, attack: 0.05 }); this.tone(900, 0.25, { type: "triangle", vol: 0.05, slide: 0.5 }); }
  reelClick() { this.tone(2400 + Math.random() * 300, 0.03, { type: "square", vol: 0.04 }); }
  bite() {
    this.tone(1320, 0.18, { type: "triangle", vol: 0.35 });
    this.tone(1760, 0.3, { type: "triangle", vol: 0.3, delay: 0.09 });
    this.splash(0.6);
  }
  hook() { this.tone(500, 0.12, { type: "sawtooth", vol: 0.12, slide: 2 }); }
  snap() { this.noise(0.12, { vol: 0.4, type: "highpass", freq: 3000 }); this.tone(180, 0.4, { type: "sawtooth", vol: 0.15, slide: 0.3 }); }
  fail() { this.tone(330, 0.25, { type: "triangle", vol: 0.2, slide: 0.7 }); this.tone(247, 0.35, { type: "triangle", vol: 0.2, delay: 0.18, slide: 0.7 }); }

  /** jingle that climbs higher and longer with tier */
  catchJingle(tier: Tier) {
    const rank = TIERS.indexOf(tier);
    const base = 523.25 * Math.pow(2, rank * 2 / 12);
    const steps = [0, 4, 7, 12, 16, 19, 24].slice(0, 3 + rank);
    steps.forEach((s, i) => {
      const f = base * Math.pow(2, s / 12);
      this.tone(f, 0.35 + rank * 0.05, { type: "triangle", vol: 0.25, delay: i * 0.085 });
      if (rank >= 2) this.tone(f * 2, 0.25, { type: "sine", vol: 0.08, delay: i * 0.085 + 0.02 });
    });
    if (rank >= 3) {
      const end = steps.length * 0.085;
      [0, 4, 7, 12].forEach((s) => this.tone(base * 2 * Math.pow(2, s / 12), 1.2, { type: "sine", vol: 0.1, delay: end, attack: 0.05 }));
      this.noise(1.0, { vol: 0.08, type: "highpass", freq: 6000, delay: end, attack: 0.1 });
    }
  }
  levelUp() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, 0.22, { type: "square", vol: 0.12, delay: i * 0.11 }));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => this.tone(f, 1.1, { type: "sawtooth", vol: 0.06, delay: 0.5, attack: 0.03 }));
    this.tone(1318.5, 1.0, { type: "triangle", vol: 0.12, delay: 0.5 });
  }
  mission() {
    [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => this.tone(f, 0.3, { type: "triangle", vol: 0.2, delay: i * 0.07 }));
  }
  coin() { this.tone(988, 0.08, { type: "square", vol: 0.1 }); this.tone(1319, 0.3, { type: "square", vol: 0.1, delay: 0.08 }); }
  harpoon() {
    this.noise(0.35, { vol: 0.3, type: "bandpass", freq: 600, freqEnd: 3500, q: 1.5, attack: 0.02 });
    this.tone(200, 0.2, { type: "sawtooth", vol: 0.08, slide: 3 });
  }
  hit() { this.noise(0.15, { vol: 0.35, type: "lowpass", freq: 2500 }); this.tone(140, 0.2, { type: "square", vol: 0.15, slide: 0.5 }); }
  roar(big = false) {
    const d = big ? 2.2 : 1.4;
    this.noise(d, { vol: 0.45, type: "lowpass", freq: 700, freqEnd: 150, attack: 0.15 });
    this.tone(big ? 55 : 80, d, { type: "sawtooth", vol: 0.25, slide: 0.6, attack: 0.2 });
    this.tone(big ? 82 : 120, d * 0.8, { type: "square", vol: 0.08, slide: 0.5, attack: 0.2 });
  }
  slam() { this.noise(0.8, { vol: 0.5, type: "lowpass", freq: 900, freqEnd: 100 }); this.tone(60, 0.6, { type: "sine", vol: 0.4, slide: 0.5 }); }
  damage() { this.tone(110, 0.3, { type: "square", vol: 0.2, slide: 0.5 }); this.noise(0.3, { vol: 0.25, type: "lowpass", freq: 600 }); }
  thunder(delay = 0) {
    this.noise(2.8, { vol: 0.6, type: "lowpass", freq: 400, freqEnd: 60, delay, attack: 0.05 });
    this.noise(0.3, { vol: 0.3, type: "lowpass", freq: 2000, freqEnd: 300, delay });
  }
  announce() { this.tone(880, 0.12, { type: "sine", vol: 0.12 }); this.tone(1175, 0.2, { type: "sine", vol: 0.12, delay: 0.1 }); }
  blip() { this.tone(520 + Math.random() * 120, 0.04, { type: "square", vol: 0.03 }); }
  click() { this.tone(1400, 0.04, { type: "triangle", vol: 0.08 }); }
  sink() { this.tone(300, 1.6, { type: "sine", vol: 0.2, slide: 0.25 }); this.noise(1.5, { vol: 0.3, type: "lowpass", freq: 800, freqEnd: 100 }); }

  /** continuous rain bed (0..1) */
  setRain(level: number) {
    if (!this.ok) return;
    if (!this.rainNode && level > 0.01) {
      const c = this.ctx!;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2500; f.Q.value = 0.4;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master!);
      src.start();
      this.rainNode = { src, gain: g };
    }
    if (this.rainNode) this.rainNode.gain.gain.value = level * 0.12;
  }
}

export const sfx = new Sfx();
