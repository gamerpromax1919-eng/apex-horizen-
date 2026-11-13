import type { AudioMixerSettings, VehicleTelemetry, WeatherId } from '../config/types';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;

  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private subOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  private turboOsc: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;

  private tireGain: GainNode | null = null;
  private tireFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private roadGain: GainNode | null = null;
  private roadFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;

  private lastGear = 1;
  private lastBoostPsi = 0;
  private initialized = false;

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.setupGraph();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private createNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  private setupGraph(): void {
    const ctx = this.ctx;
    if (!ctx || this.initialized) return;
    this.initialized = true;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.65;
    this.masterGain.connect(ctx.destination);

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.22;
    this.engineGain.connect(this.masterGain);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.55;
    this.sfxGain.connect(this.masterGain);

    this.ambienceGain = ctx.createGain();
    this.ambienceGain.gain.value = 0.35;
    this.ambienceGain.connect(this.masterGain);

    // Layered harmonic engine synth
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineFilter.Q.value = 2.4;
    this.engineFilter.connect(this.engineGain);

    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc1.frequency.value = 65;
    this.osc1.connect(this.engineFilter);

    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'triangle';
    this.osc2.frequency.value = 130;
    this.osc2.connect(this.engineFilter);

    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subOsc.frequency.value = 32.5;
    this.subOsc.connect(this.engineFilter);

    // Turbo spool whine
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turboOsc = ctx.createOscillator();
    this.turboOsc.type = 'sine';
    this.turboOsc.frequency.value = 1800;
    this.turboOsc.connect(this.turboGain);
    this.turboGain.connect(this.engineGain);

    this.osc1.start();
    this.osc2.start();
    this.subOsc.start();
    this.turboOsc.start();

    const noiseBuf = this.createNoiseBuffer(ctx, 2);

    // Tire squeal bandpass
    const tireSrc = ctx.createBufferSource();
    tireSrc.buffer = noiseBuf;
    tireSrc.loop = true;
    this.tireFilter = ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.value = 1350;
    this.tireFilter.Q.value = 8;
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    tireSrc.connect(this.tireFilter);
    this.tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.sfxGain);
    tireSrc.start();

    // Wind rush noise
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuf;
    windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 480;
    this.windFilter.Q.value = 0.8;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.ambienceGain);
    windSrc.start();

    // Surface rolling rumble
    const roadSrc = ctx.createBufferSource();
    roadSrc.buffer = noiseBuf;
    roadSrc.loop = true;
    this.roadFilter = ctx.createBiquadFilter();
    this.roadFilter.type = 'lowpass';
    this.roadFilter.frequency.value = 180;
    this.roadGain = ctx.createGain();
    this.roadGain.gain.value = 0;
    roadSrc.connect(this.roadFilter);
    this.roadFilter.connect(this.roadGain);
    this.roadGain.connect(this.sfxGain);
    roadSrc.start();

    // Rain ambience
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = noiseBuf;
    rainSrc.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1800;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rainSrc.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.ambienceGain);
    rainSrc.start();
  }

  public update(
    t: VehicleTelemetry,
    baseNoteHz: number,
    weatherId: WeatherId,
    mixer: AudioMixerSettings,
    paused: boolean
  ): void {
    if (!this.ctx || !this.masterGain || !this.initialized) return;
    const now = this.ctx.currentTime;

    const targetMaster = paused || mixer.muted ? 0 : mixer.master;
    this.masterGain.gain.setTargetAtTime(targetMaster, now, 0.05);
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(mixer.engine * 0.24, now, 0.05);
    if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(mixer.sfx * 0.65, now, 0.05);
    if (this.ambienceGain) this.ambienceGain.gain.setTargetAtTime(mixer.ambience * 0.55, now, 0.05);

    if (paused) return;

    // Engine frequency & harmonic tone from RPM
    const rpmNorm = Math.max(0.12, t.rpm / 8000);
    const f1 = baseNoteHz * (0.45 + rpmNorm * 2.2);
    this.osc1?.frequency.setTargetAtTime(f1, now, 0.025);
    this.osc2?.frequency.setTargetAtTime(f1 * 1.995, now, 0.025);
    this.subOsc?.frequency.setTargetAtTime(f1 * 0.5, now, 0.025);
    this.engineFilter?.frequency.setTargetAtTime(
      260 + rpmNorm * 1450 + (t.nitrousActive ? 600 : 0),
      now,
      0.04
    );

    // Turbo spool & blow-off valve flutter
    const boostNorm = Math.max(0, t.boostPsi / 20);
    this.turboOsc?.frequency.setTargetAtTime(1400 + boostNorm * 2600, now, 0.04);
    this.turboGain?.gain.setTargetAtTime(boostNorm * 0.055, now, 0.05);

    if (this.lastBoostPsi > 6 && t.boostPsi < 0.5) {
      this.triggerBlowOff();
    }
    this.lastBoostPsi = t.boostPsi;

    // Gear shift click + exhaust pop on downshift
    if (t.gear !== this.lastGear) {
      this.triggerGearShift(t.gear < this.lastGear);
      this.lastGear = t.gear;
    }

    // Tire squeal from average wheel slip
    const maxSlip = Math.max(
      ...t.wheels.map((w) => (w.grounded ? Math.abs(w.slipAngleRad) * 1.6 + Math.abs(w.slipRatio) : 0))
    );
    const isAsphalt = t.surface === 'asphalt' || t.surface === 'curb';
    const squealVol =
      isAsphalt && t.speedKmh > 18 && maxSlip > 0.22
        ? Math.min(0.28, (maxSlip - 0.22) * 0.45)
        : 0;
    this.tireGain?.gain.setTargetAtTime(squealVol, now, 0.04);

    // Road rolling rumble
    const roughMult =
      t.surface === 'gravel'
        ? 0.24
        : t.surface === 'dirt' || t.surface === 'grass'
          ? 0.16
          : 0.06;
    const roadVol = Math.min(0.26, (t.speedKmh / 160) * roughMult);
    this.roadGain?.gain.setTargetAtTime(roadVol, now, 0.05);
    this.roadFilter?.frequency.setTargetAtTime(
      t.surface === 'gravel' ? 480 : 190 + t.speedKmh * 1.2,
      now,
      0.05
    );

    // Wind rush scaling with speed^1.4
    const windVol = Math.min(0.24, Math.pow(t.speedKmh / 240, 1.4) * 0.22);
    this.windGain?.gain.setTargetAtTime(windVol, now, 0.06);
    this.windFilter?.frequency.setTargetAtTime(320 + t.speedKmh * 2.4, now, 0.06);

    // Rain ambience
    const rainAmt = weatherId === 'thunderstorm' ? 0.18 : weatherId === 'heavy_rain' ? 0.12 : 0;
    this.rainGain?.gain.setTargetAtTime(rainAmt, now, 0.2);

    // Collision thud
    if (t.impactIntensity > 0.35) {
      this.triggerImpact(t.impactIntensity);
    }
  }

  private triggerBlowOff(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2200, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.16);
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  private triggerGearShift(downshift: boolean): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = downshift ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(downshift ? 110 : 180, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.07);
    g.gain.setValueAtTime(0.055, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  private triggerImpact(intensity: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.22);
    g.gain.setValueAtTime(Math.min(0.45, intensity * 0.4), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.initialized = false;
    }
  }
}
