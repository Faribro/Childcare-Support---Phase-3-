'use client';

const SOUND_STORAGE_KEY = 'cosmic-sound-enabled';

/**
 * CosmicSoundEngine
 * Lightweight, battery-safe, offline-first Web Audio API sound system.
 * - Synthesizes rocket launch thruster & evaluation unlock chimes in code (0 KB download, zero latency).
 * - Synthesizes a slow, warm cosmic drone for the starry sky (blend = 0).
 * - Synthesizes continuous rushing water & meadow breeze for the playground footer (blend = 1).
 * - Smoothly crossfades between space & playground audio buses via equal-power curves on scroll.
 * - Gracefully layers authentic background loops (/sounds/measured-horizon.mp3 & /sounds/playground-children.mp3).
 * - Cleanly stops on tab blur, screen lock, pause, and route changes.
 */
class CosmicSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Space bus (blend = 0)
  private spaceGain: GainNode | null = null;
  private spaceNodes: AudioNode[] = [];
  private spaceBuffer: AudioBuffer | null = null;
  private spaceSource: AudioBufferSourceNode | null = null;
  private isLoadingSpaceAudio = false;

  // Playground bus (blend = 1)
  private playgroundGain: GainNode | null = null;
  private playgroundNodes: AudioNode[] = [];
  private playgroundBuffer: AudioBuffer | null = null;
  private playgroundSource: AudioBufferSourceNode | null = null;
  private playgroundLaughterGain: GainNode | null = null;
  private isLoadingPlaygroundAudio = false;

  private defaultVolume = 0.05; // Default 5 volume (0.05)
  private miniatureInteractions = 0;

  private enabled = false; // Turned OFF by default
  private ambientActive = false;
  private currentBlend = 0; // 0 = Cosmic Space (top), 1 = Kids Playground (bottom)

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(SOUND_STORAGE_KEY);
        if (stored !== null) {
          this.enabled = stored === 'true';
        } else {
          this.enabled = false; // Default OFF
        }
      } catch {
        // Fallback for sandboxed webviews
      }
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.enabled ? 1 : 0;
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    try {
      window.localStorage.setItem(SOUND_STORAGE_KEY, String(next));
    } catch {
      // Ignore storage errors
    }

    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(next ? 1 : 0, now, 0.08);
    }

    if (!next) {
      this.stopAmbience();
    }
  }

  /** Satisfy browser autoplay rules on the first user interaction */
  public unlock(): void {
    this.ensureContext();
  }

  // ─── SFX 1: Rocket Launch Sound (Authenticated "Start New Survey") ─────────
  public playRocketLaunch(): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const duration = 1.15;

    // 1) Filtered white noise thruster roar
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(220, now);
    filter.frequency.exponentialRampToValueAtTime(2100, now + 0.55);
    filter.frequency.exponentialRampToValueAtTime(520, now + duration);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.28, now + 0.09);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    // 2) Deep ignition sub-rumble sweeping upward
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(58, now);
    subOsc.frequency.exponentialRampToValueAtTime(165, now + 0.85);

    const subFilter = ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(240, now);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.20, now + 0.06);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

    subOsc.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + duration);
    subOsc.start(now);
    subOsc.stop(now + 0.96);
  }

  // ─── SFX 2: Evaluation Portal Unlock Chime ──────────────────────────────────
  public playEvaluationUnlock(): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    // 1) Crisp lock-latch click
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(980, now);
    clickOsc.frequency.exponentialRampToValueAtTime(260, now + 0.055);
    clickGain.gain.setValueAtTime(0.18, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    clickOsc.connect(clickGain);
    clickGain.connect(this.masterGain);
    clickOsc.start(now);
    clickOsc.stop(now + 0.065);

    // 2) Ascending futuristic crystal chord (C5 -> G5 -> B5 -> D6)
    const notes = [523.25, 783.99, 987.77, 1174.66];
    notes.forEach((freq, idx) => {
      const start = now + 0.06 + idx * 0.075;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = idx === notes.length - 1 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.52);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  }

  // ─── Ambient Soundscape: Space Drone <-> Outdoor Playground Crossfade ───────
  public async startAmbience(initialBlend = 0): Promise<void> {
    if (!this.enabled || this.ambientActive) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    this.ambientActive = true;
    this.currentBlend = Math.max(0, Math.min(1, initialBlend));

    // ─────────────────────────────────────────────────────────────────────────
    // ZONE A: Cosmic Space (Top of Page, blend = 0)
    // ─────────────────────────────────────────────────────────────────────────
    const spaceGain = ctx.createGain();
    spaceGain.gain.value = 0.0001;
    spaceGain.connect(this.masterGain);
    this.spaceGain = spaceGain;

    const spaceFilter = ctx.createBiquadFilter();
    spaceFilter.type = 'lowpass';
    spaceFilter.frequency.value = 260;
    spaceFilter.Q.value = 0.8;
    spaceFilter.connect(spaceGain);

    // Slow LFO breathing sweep on space filter (~11s cycle)
    const spaceLfo = ctx.createOscillator();
    const spaceLfoGain = ctx.createGain();
    spaceLfo.frequency.value = 0.09;
    spaceLfoGain.gain.value = 95;
    spaceLfo.connect(spaceLfoGain);
    spaceLfoGain.connect(spaceFilter.frequency);
    spaceLfo.start();

    // Warm C2 + G2 + C3 pad with gentle detuning
    const droneFreqs = [65.41, 98.0, 130.81];
    const droneOscs = droneFreqs.map((f, i) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      osc.detune.value = (i - 1) * 4.5;
      oscGain.gain.value = i === 0 ? 0.38 : 0.16;
      osc.connect(oscGain);
      oscGain.connect(spaceFilter);
      osc.start();
      return osc;
    });

    this.spaceNodes = [spaceLfo, spaceLfoGain, spaceFilter, ...droneOscs];

    // ─────────────────────────────────────────────────────────────────────────
    // ZONE B: Outdoor Meadow & Playground (Bottom of Page, blend = 1)
    // Pure realistic field ambience: Flowing stream/waterfall + soft meadow breeze
    // Expert studio mastering: High-pass cleanup + gentle presence EQ + transparent dynamics compressor
    // ─────────────────────────────────────────────────────────────────────────
    const playgroundGain = ctx.createGain();
    playgroundGain.gain.value = 0.0001;

    // Expert master processing chain for the playground bus
    const busHighPass = ctx.createBiquadFilter();
    busHighPass.type = 'highpass';
    busHighPass.frequency.value = 75; // Clean out low-end rumble

    const busWarmth = ctx.createBiquadFilter();
    busWarmth.type = 'peaking';
    busWarmth.frequency.value = 1800; // Warm natural presence for laughter & nature
    busWarmth.gain.value = 1.2;
    busWarmth.Q.value = 1.0;

    const busHighShelf = ctx.createBiquadFilter();
    busHighShelf.type = 'highshelf';
    busHighShelf.frequency.value = 6500; // Soften harsh highs for a velvety, silky background
    busHighShelf.gain.value = -2.2;

    const busCompressor = ctx.createDynamicsCompressor();
    busCompressor.threshold.value = -20;
    busCompressor.knee.value = 12;
    busCompressor.ratio.value = 3.2;
    busCompressor.attack.value = 0.025;
    busCompressor.release.value = 0.24;

    playgroundGain.connect(busHighPass);
    busHighPass.connect(busWarmth);
    busWarmth.connect(busHighShelf);
    busHighShelf.connect(busCompressor);
    busCompressor.connect(this.masterGain);
    this.playgroundGain = playgroundGain;

    // Loopable 3-second noise buffer for pure natural ambient synthesis
    const noiseSecs = 3;
    const noiseSamples = Math.floor(ctx.sampleRate * noiseSecs);
    const ambientNoiseBuffer = ctx.createBuffer(1, noiseSamples, ctx.sampleRate);
    const ambientNoiseData = ambientNoiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseSamples; i++) {
      ambientNoiseData[i] = Math.random() * 2 - 1;
    }

    // 1) Continuous cascading waterfall & river water sound
    const waterSource = ctx.createBufferSource();
    waterSource.buffer = ambientNoiseBuffer;
    waterSource.loop = true;

    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.value = 1100;
    waterFilter.Q.value = 1.6;

    // Gentle modulation for natural rushing water fluctuation
    const waterLfo = ctx.createOscillator();
    const waterLfoGain = ctx.createGain();
    waterLfo.frequency.value = 0.22;
    waterLfoGain.gain.value = 320;
    waterLfo.connect(waterLfoGain);
    waterLfoGain.connect(waterFilter.frequency);
    waterLfo.start();

    const waterGain = ctx.createGain();
    waterGain.gain.value = 0.038; // Calm, subtle trickling stream

    waterSource.connect(waterFilter);
    waterFilter.connect(waterGain);
    waterGain.connect(playgroundGain);
    waterSource.start();

    // 2) Soft meadow breeze airflow sound
    const breezeSource = ctx.createBufferSource();
    breezeSource.buffer = ambientNoiseBuffer;
    breezeSource.loop = true;

    const breezeFilter = ctx.createBiquadFilter();
    breezeFilter.type = 'lowpass';
    breezeFilter.frequency.value = 340;
    breezeFilter.Q.value = 0.7;

    const breezeLfo = ctx.createOscillator();
    const breezeLfoGain = ctx.createGain();
    breezeLfo.frequency.value = 0.11; // Slow 9-second wind gust breathing
    breezeLfoGain.gain.value = 120;
    breezeLfo.connect(breezeLfoGain);
    breezeLfoGain.connect(breezeFilter.frequency);
    breezeLfo.start();

    const breezeGain = ctx.createGain();
    breezeGain.gain.value = 0.028; // Gentle whisper of outdoor breeze

    breezeSource.connect(breezeFilter);
    breezeFilter.connect(breezeGain);
    breezeGain.connect(playgroundGain);
    breezeSource.start();

    this.playgroundNodes = [
      busHighPass,
      busWarmth,
      busHighShelf,
      busCompressor,
      waterSource,
      waterFilter,
      waterLfo,
      waterLfoGain,
      waterGain,
      breezeSource,
      breezeFilter,
      breezeLfo,
      breezeLfoGain,
      breezeGain,
    ];

    // Set initial crossfade blend based on scroll
    this.setScrollBlend(this.currentBlend);

    // Asynchronously load and layer the recorded audio files
    this.loadAndPlaySpaceAudio();
    this.loadAndPlayPlaygroundAudio();
  }

  // Load and layer Measured_Horizon.mp3 (23s loop) into the space bus
  private async loadAndPlaySpaceAudio(): Promise<void> {
    if (!this.ctx || !this.spaceGain || this.isLoadingSpaceAudio) return;

    try {
      if (!this.spaceBuffer) {
        this.isLoadingSpaceAudio = true;
        const res = await fetch('/sounds/measured-horizon.mp3');
        if (!res.ok) return;
        const arr = await res.arrayBuffer();
        this.spaceBuffer = await this.ctx.decodeAudioData(arr);
      }

      if (!this.ambientActive || !this.ctx || !this.spaceGain) return;

      const src = this.ctx.createBufferSource();
      src.buffer = this.spaceBuffer;
      src.loop = true;

      // Seamless background musical loop (Measured Horizon)
      const subGain = this.ctx.createGain();
      subGain.gain.value = 0.85; // Mastered background music level
      src.connect(subGain);
      subGain.connect(this.spaceGain);
      src.start(0);
      this.spaceSource = src;
    } catch {
      // Gracefully fall back to synthesized drone if offline or missing
    } finally {
      this.isLoadingSpaceAudio = false;
    }
  }

  // Load and layer playground-children.mp3 / laughter-in-the-tall-grass.mp3 into the playground bus
  private async loadAndPlayPlaygroundAudio(): Promise<void> {
    if (!this.ctx || !this.playgroundGain || this.isLoadingPlaygroundAudio) return;

    try {
      if (!this.playgroundBuffer) {
        this.isLoadingPlaygroundAudio = true;
        let res = await fetch('/sounds/laughter-in-the-tall-grass.mp3');
        if (!res.ok) {
          res = await fetch('/sounds/playground-children.mp3');
        }
        if (!res.ok) return;
        const arr = await res.arrayBuffer();
        this.playgroundBuffer = await this.ctx.decodeAudioData(arr);
      }

      if (!this.ambientActive || !this.ctx || !this.playgroundGain) return;

      const src = this.ctx.createBufferSource();
      src.buffer = this.playgroundBuffer;
      src.loop = true;

      // Mastered laughter audio stream connecting to playground bus
      const laughterGain = this.ctx.createGain();
      laughterGain.gain.value = 1.0;
      src.connect(laughterGain);
      laughterGain.connect(this.playgroundGain);
      this.playgroundLaughterGain = laughterGain;
      src.start(0);
      this.playgroundSource = src;
    } catch {
      // Gracefully fall back to synthesized stream & breeze if offline
    } finally {
      this.isLoadingPlaygroundAudio = false;
    }
  }

  /**
   * Tracks an interactive touch/click on a miniature element in the playground.
   * Volume defaults to 5 (0.05) and increases by +0.01 with each interaction.
   * Background music continues playing simultaneously.
   */
  public recordMiniatureInteraction(): void {
    if (!this.enabled) return;
    this.miniatureInteractions++;
    const boost = this.miniatureInteractions * 0.01;
    const newLaughterVol = Math.min(0.25, this.defaultVolume + boost);

    if (this.ctx && this.playgroundGain) {
      const now = this.ctx.currentTime;
      const playVol = (0.60 + 0.40 * Math.sin(this.currentBlend * Math.PI * 0.5)) * newLaughterVol;
      this.playgroundGain.gain.cancelScheduledValues(now);
      this.playgroundGain.gain.setTargetAtTime(playVol, now, 0.18);
    }

    // Refresh scroll blend volumes with updated playground volume
    this.setScrollBlend(this.currentBlend);

    // Play a delightful micro-chime pop on interaction
    this.playInteractionPop();
  }

  public getMiniatureInteractions(): number {
    return this.miniatureInteractions;
  }

  public getLaughterVolume(): number {
    return this.defaultVolume + this.miniatureInteractions * 0.01;
  }

  private playInteractionPop(): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const notes = [587.33, 659.25, 783.99, 880.0, 1046.5]; // D5, E5, G5, A5, C6 playful acoustic pentatonic
    const note = notes[this.miniatureInteractions % notes.length];
    osc.frequency.setValueAtTime(note, now);
    osc.frequency.exponentialRampToValueAtTime(note * 1.15, now + 0.07);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.07, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /**
   * Set the scroll blend ratio:
   * 0.0 = Top of page (Starry Cosmic Sky & Planets)
   * 1.0 = Bottom of page (Meadow & Miniature Garden Playground)
   * Dual simultaneous playback:
   * Both the background music bed (Measured Horizon) and the playground laughter/stream
   * play simultaneously in an expert multi-track acoustic mix.
   */
  public setScrollBlend(blend: number): void {
    const clamped = Math.max(0, Math.min(1, blend));
    this.currentBlend = clamped;
    if (!this.ctx || !this.ambientActive) return;

    const now = this.ctx.currentTime;
    // Default 5 volume (0.05) base; footer playground scales up with miniature interactions
    const effectivePlayVolume = Math.min(0.25, this.defaultVolume + this.miniatureInteractions * 0.01);

    // Background music plays simultaneously across the entire page (0.75 to 1.00 of default 5 volume)
    const spaceVol = (0.75 + 0.25 * Math.cos(clamped * Math.PI * 0.5)) * this.defaultVolume;
    // Playground laughter & nature play simultaneously, blooming gently as you near the bottom
    const playVol = (0.60 + 0.40 * Math.sin(clamped * Math.PI * 0.5)) * effectivePlayVolume;

    this.spaceGain?.gain.setTargetAtTime(spaceVol, now, 0.22);
    this.playgroundGain?.gain.setTargetAtTime(playVol, now, 0.22);
  }

  /**
   * Cleanly fades out and stops all ambient loops.
   * Call on route navigation, component unmount, tab hide (document.hidden), or pause.
   */
  public stopAmbience(): void {
    this.ambientActive = false;
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    this.spaceGain?.gain.setTargetAtTime(0.0001, now, 0.12);
    this.playgroundGain?.gain.setTargetAtTime(0.0001, now, 0.12);

    const spaceNodesToClean = [...this.spaceNodes];
    const playNodesToClean = [...this.playgroundNodes];
    const spaceSrc = this.spaceSource;
    const playSrc = this.playgroundSource;

    this.spaceNodes = [];
    this.playgroundNodes = [];
    this.spaceSource = null;
    this.playgroundSource = null;

    window.setTimeout(() => {
      [...spaceNodesToClean, ...playNodesToClean].forEach((node) => {
        try {
          if ('stop' in node && typeof (node as OscillatorNode | AudioBufferSourceNode).stop === 'function') {
            (node as OscillatorNode | AudioBufferSourceNode).stop();
          }
          node.disconnect();
        } catch {
          // Already stopped or disconnected
        }
      });
      try {
        spaceSrc?.stop();
        spaceSrc?.disconnect();
      } catch {
        // Already stopped
      }
      try {
        playSrc?.stop();
        playSrc?.disconnect();
      } catch {
        // Already stopped
      }
    }, 320);
  }
}

export const cosmicSound = new CosmicSoundEngine();
