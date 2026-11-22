import { create } from 'zustand';

export type LaunchPhase = 'idle' | 'launching' | 'reduced';

export interface LaunchOrigin {
  top: number;
  left: number;
  width: number;
  height: number;
  travelX: number;
  recoilX: number;
}

export interface StartLaunchOptions {
  triggerId: string;
  rect: DOMRect | null;
  label?: string;
  logoSrc?: string;
  loadingText?: string;
  onFormReady?: () => void;
  onComplete?: () => void;
}

interface LaunchTransitionState {
  phase: LaunchPhase;
  activeTriggerId: string | null;
  origin: LaunchOrigin | null;
  label: string;
  logoSrc: string | null;
  loadingText: string;
  soundEnabled: boolean;

  setSoundEnabled: (enabled: boolean) => void;
  toggleSound: () => void;
  startLaunch: (options: StartLaunchOptions) => void;
  cancelLaunch: () => void;
}

const TOTAL_DURATION_MS = 3000;
const FORM_READY_MS = 2350;
const REDUCED_MOTION_MS = 450;

// Module-scoped timer handles keep non-serializable refs out of reactive store state
let readyTimerId: number | null = null;
let completeTimerId: number | null = null;

function clearTimers() {
  if (readyTimerId !== null) {
    window.clearTimeout(readyTimerId);
    readyTimerId = null;
  }
  if (completeTimerId !== null) {
    window.clearTimeout(completeTimerId);
    completeTimerId = null;
  }
}

function playLaunchAudioCue() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // 1) Filtered air whoosh synced with rocket boost (0.12s -> 0.95s)
    const bufferSize = Math.floor(ctx.sampleRate * 0.9);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const channel = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channel[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(240, now + 0.12);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 0.65);
    filter.frequency.exponentialRampToValueAtTime(360, now + 0.95);
    filter.Q.value = 1.4;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now + 0.1);
    noiseGain.gain.linearRampToValueAtTime(0.11, now + 0.35);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.98);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now + 0.1);
    noise.stop(now + 1.0);

    // 2) Warm two-note chime when Alliance India logo surfaces in the clouds (~1.05s)
    [523.25, 659.25].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + 1.05 + idx * 0.12;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.055, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.75);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.8);
    });

    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 2400);
  } catch {
    // Ignore audio blocks gracefully
  }
}

export const useLaunchTransitionStore = create<LaunchTransitionState>((set, get) => ({
  phase: 'idle',
  activeTriggerId: null,
  origin: null,
  label: 'Start New Survey',
  logoSrc: null,
  loadingText: 'Opening survey form...',
  soundEnabled: true,

  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),

  startLaunch: ({
    triggerId,
    rect,
    label = 'Start New Survey',
    logoSrc = null,
    loadingText = 'Opening survey form...',
    onFormReady,
    onComplete,
  }) => {
    // Idempotency guard: ignore rapid double-taps
    if (get().phase !== 'idle') return;
    clearTimers();

    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      set({
        phase: 'reduced',
        activeTriggerId: triggerId,
        origin: null,
        label,
        logoSrc,
        loadingText,
      });

      readyTimerId = window.setTimeout(() => {
        onFormReady?.();
      }, 180);

      completeTimerId = window.setTimeout(() => {
        clearTimers();
        set({ phase: 'idle', activeTriggerId: null, origin: null });
        onComplete?.();
      }, REDUCED_MOTION_MS);
      return;
    }

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

    const top = rect ? rect.top : vh * 0.2;
    const left = rect ? rect.left : vw * 0.5 - 120;
    const width = rect ? rect.width : 240;
    const height = rect ? rect.height : 48;

    const remainingRight = Math.max(180, vw - left);
    const recoilX = left > vw * 0.45 ? -56 : -26;
    const travelX = remainingRight + width + 220;

    set({
      phase: 'launching',
      activeTriggerId: triggerId,
      origin: { top, left, width, height, travelX, recoilX },
      label,
      logoSrc,
      loadingText,
    });

    if (get().soundEnabled) {
      playLaunchAudioCue();
    }

    // Mount new form / trigger route navigation under full cloud cover (2.35s)
    readyTimerId = window.setTimeout(() => {
      onFormReady?.();
    }, FORM_READY_MS);

    // Clear overlay at exactly 3.00s as clouds finish parting
    completeTimerId = window.setTimeout(() => {
      clearTimers();
      set({ phase: 'idle', activeTriggerId: null, origin: null });
      onComplete?.();
    }, TOTAL_DURATION_MS);
  },

  cancelLaunch: () => {
    clearTimers();
    set({ phase: 'idle', activeTriggerId: null, origin: null });
  },
}));

// Atomic reusable selectors (zero object allocation -> zero wasted re-renders)
export const selectIsLaunching = (s: LaunchTransitionState) => s.phase !== 'idle';
export const selectSoundEnabled = (s: LaunchTransitionState) => s.soundEnabled;
