// Burst-sized AI voices and one precisely timed airstrike. A WebKit media seek
// or start can block game frames. Decode each authored clip once per launch;
// AudioBufferSourceNodes are single-use, logical voices and gain nodes are pooled.
export const WORLD_GUN_PATHS = {
  enemy: '/audio/sfx/machine_gun_burst_01.wav', support: '/audio/sfx/us-support-gun.wav',
  pattern04: '/audio/sfx/m16-rifle-pattern-04.wav', pattern12: '/audio/sfx/m16-rifle-pattern-12.wav',
  pattern03: '/audio/sfx/m16-rifle-pattern-03.wav', pattern14: '/audio/sfx/m16-rifle-pattern-14.wav',
} as const;
export const NAPALM_SEQUENCE_CLIP = '/audio/sfx/napalm_strike.wav';

export class WorldGunBank {
  readonly buffers = new Map<string, AudioBuffer>();
  private readonly abort = new AbortController();
  private disposed = false;
  constructor(readonly context: AudioContext | null) {}
  async preload(url: string) {
    if (!this.context || this.disposed) return;
    try {
      const response = await fetch(url, { signal: this.abort.signal });
      if (!response.ok || this.disposed) return;
      const bytes = await response.arrayBuffer();
      if (this.disposed) return;
      const buffer = await this.context.decodeAudioData(bytes);
      if (!this.disposed) this.buffers.set(url, buffer);
    } catch { /* Blocked fetch, invalid clip or closed context: use this voice's HTML fallback. */ }
  }
  resume() {
    if (this.context?.state === 'suspended' && !this.disposed) void this.context.resume().catch(() => {});
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.buffers.clear();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
  }
}

/** Called inside the actual menu gesture, before the lazy scene import or native picker. */
export function primeWorldGunBank() {
  let context: AudioContext | null = null;
  try {
    const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) context = new Ctor({ latencyHint: 'interactive' });
  } catch { /* AudioContext may be absent or disabled in the embedding host. */ }
  const bank = new WorldGunBank(context);
  bank.resume();
  for (const url of [...Object.values(WORLD_GUN_PATHS), NAPALM_SEQUENCE_CLIP]) void bank.preload(url);
  return bank;
}

/** The existing gun mixer owns envelopes, rate/offset randomization and voice
 * limits. This adapter changes transport only. An early/failing decode uses the
 * real HTML clip for that play and is never replayed when decoding completes. */
export class WorldGunVoice {
  private node: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private fallback: HTMLAudioElement | null = null;
  private logicalVolume = 0;
  private offset = 0;
  private disposed = false;
  private generation = 0;
  playbackRate = 1;
  onended: (() => void) | null = null;
  constructor(private readonly bank: WorldGunBank, private readonly url: string) {}
  get volume() { return this.logicalVolume; }
  set volume(value: number) {
    this.logicalVolume = value;
    if (this.gain) this.gain.gain.value = value;
    if (this.fallback && !this.fallback.paused) this.fallback.volume = value;
  }
  get duration() { return this.bank.buffers.get(this.url)?.duration ?? this.fallback?.duration ?? NaN; }
  get paused() { return !this.node && (!this.fallback || this.fallback.paused); }
  set currentTime(value: number) { this.offset = value; }
  /** True only after the exact buffer was scheduled on a running context. */
  tryPlayDecoded(): boolean {
    if (this.disposed || !this.paused) return false;
    const context = this.bank.context, buffer = this.bank.buffers.get(this.url);
    if (context?.state === 'running' && buffer) {
      let source: AudioBufferSourceNode | null = null;
      try {
        const node = source = context.createBufferSource();
        if (!this.gain) { this.gain = context.createGain(); this.gain.connect(context.destination); }
        this.gain.gain.value = this.volume;
        node.buffer = buffer;
        node.playbackRate.value = this.playbackRate;
        node.connect(this.gain);
        node.onended = () => {
          if (this.node !== node) return;
          this.node = null; node.disconnect(); this.onended?.();
        };
        this.node = node;
        node.start(0, Math.max(0, Math.min(this.offset, buffer.duration)));
        this.generation++;
        return true;
      } catch {
        this.node = null;
        if (source) { source.onended = null; source.disconnect(); }
        // If the output device changed mid-call, keep this particular shot audible.
      }
    }
    return false;
  }
  play(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Disposed world gun voice'));
    if (!this.paused || this.tryPlayDecoded()) return Promise.resolve();
    const generation = ++this.generation;
    try {
      const audio = this.fallback ??= new Audio(this.url);
      audio.volume = this.volume; audio.playbackRate = this.playbackRate;
      try { audio.currentTime = this.offset; } catch { /* Metadata not available yet. */ }
      audio.onended = () => { if (this.generation === generation) this.onended?.(); };
      return audio.play();
    } catch(error) { return Promise.reject(error); }
  }
  pause() {
    this.generation++;
    const node = this.node;
    if (node) { this.node = null; node.onended = null; node.stop(); node.disconnect(); }
    if (this.fallback && !this.fallback.paused) this.fallback.pause();
  }
  dispose() {
    this.disposed = true; this.pause(); this.gain?.disconnect(); this.gain = null;
    if (this.fallback) { this.fallback.onended = null; this.fallback.removeAttribute('src'); this.fallback.load(); this.fallback = null; }
    this.onended = null;
  }
}

interface StrikeVoice {
  decoded: WorldGunVoice;
  media: HTMLAudioElement | null;
  order: number;
  cancelPending: (() => void) | null;
}

/** Start the effect and the original 17.96s clip in the same turn, at sample
 * zero and rate 1. Only the slow/unavailable Web Audio path waits on media;
 * 'playing', its promise, its deadline, and teardown must never launch twice. */
export class NapalmSequencePool {
  private voices: StrikeVoice[];
  private sequence = 0;
  private level = 0;
  private disposed = false;
  constructor(private readonly bank: WorldGunBank) {
    this.voices = Array.from({length:2}, () => ({
      decoded:new WorldGunVoice(bank,NAPALM_SEQUENCE_CLIP),media:null,order:0,cancelPending:null,
    }));
  }
  get volume() { return this.level; }
  set volume(value: number) {
    this.level = value;
    for (const v of this.voices) { v.decoded.volume = value; if (v.media) v.media.volume = value; }
  }
  private stopVoice(v: StrikeVoice) {
    v.cancelPending?.();
    v.decoded.pause();
    if (v.media) { v.media.pause(); try { v.media.currentTime = 0; } catch { /* Not yet loaded. */ } }
  }
  start(onStarted?: (audibleAtMs: number) => void) {
    if (this.disposed) return;
    const v = this.voices.find(v => !v.cancelPending && v.decoded.paused && (!v.media || v.media.paused))
      ?? this.voices.reduce((a,b) => a.order < b.order ? a : b);
    this.stopVoice(v); v.order = ++this.sequence;
    const context = this.bank.context;
    const startTime = context?.currentTime ?? 0;
    if (v.decoded.tryPlayDecoded() && context) {
      // Translate the scheduled sample into the output device’s presentation clock.
      const stamp = context.getOutputTimestamp?.();
      const now = performance.now();
      const audibleAt = stamp?.performanceTime && stamp.contextTime !== undefined
        ? stamp.performanceTime + (startTime - stamp.contextTime) * 1000
        : now + ((context.outputLatency || 0) + (context.baseLatency || 0)) * 1000;
      onStarted?.(audibleAt);
      return;
    }
    let media: HTMLAudioElement;
    try {
      if (!v.media) {
        media = new Audio(); media.preload = 'auto'; media.volume = this.level; media.src = NAPALM_SEQUENCE_CLIP;
        v.media = media;
      } else { media = v.media; }
    } catch { onStarted?.(performance.now()); return; }
    let live = true, timer: number | undefined;
    const cancel = () => {
      live = false; v.cancelPending = null; media.removeEventListener('playing', audible);
      if (timer !== undefined) window.clearTimeout(timer);
    };
    const finish = (silent: boolean) => {
      if (!live) return; cancel();
      if (silent) { media.pause(); try { media.currentTime = 0; } catch { /* Decode failed. */ } }
      onStarted?.(performance.now() - (silent ? 0 : media.currentTime * 1000));
    };
    const audible = () => finish(false);
    v.cancelPending = cancel; media.addEventListener('playing',audible);
    timer = window.setTimeout(() => finish(true),1500);
    try { void media.play().then(audible, () => finish(true)); } catch { finish(true); }
  }
  stop() { for (const v of this.voices) this.stopVoice(v); }
  dispose() {
    this.disposed = true; this.stop();
    for (const v of this.voices) {
      v.decoded.dispose();
      if (v.media) { v.media.removeAttribute('src'); v.media.load(); v.media = null; }
    }
  }
}
