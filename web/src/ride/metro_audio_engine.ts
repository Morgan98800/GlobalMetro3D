/**
 * Real-sample multi-bus WebAudio engine for Paris Metro & RER 3D views.
 *
 * Uses authentic CC-BY-SA Wikimedia Commons field recordings (MP 59 pneumatic,
 * MF 77 steel rail, Pont Marie vaulted station ambience, Ligne 8 Zoom H4N
 * station entry, and real RATP 600 Hz door closing buzzer) transcoded to compact
 * AAC (.m4a) for universal Safari iOS/macOS, Chrome, and Firefox decoding.
 *
 * Architecture:
 *   MasterBus (Gain -> Limiter)
 *     <- RollBus (pneu/fer seamless loop -> dynamic LP filter -> duckable gain)
 *     <- TunnelBus (tunnel air rush loop -> LP filter -> gain)
 *     <- StationBus (Pont Marie vaulted platform ambience -> duckable gain)
 *     <- OneShotBus (real door buzzer, arrival brake, departure swell)
 *     <- VaultReverb (ConvolverNode IR, attenuated on open-air viaducts)
 */

export type AudioCameraView = 'vault' | 'ride' | 'passenger';

export interface MetroAudioTelemetry {
  speedKmh: number;
  isOpenAir: boolean;
  stockId: string;
  isPneumatic: boolean;
  atStop: boolean;
  paused: boolean;
  view?: AudioCameraView;
}

type SampleKey =
  | 'pneu_roll'
  | 'fer_roll'
  | 'station_ambience'
  | 'tunnel_ambience'
  | 'door_buzzer'
  | 'train_arrive'
  | 'pneu_depart';

const SAMPLE_URLS: Record<SampleKey, string> = {
  pneu_roll: '/audio/metro/pneu_roll_loop.m4a',
  fer_roll: '/audio/metro/fer_roll_loop.m4a',
  station_ambience: '/audio/metro/station_ambience_loop.m4a',
  tunnel_ambience: '/audio/metro/tunnel_ambience_loop.m4a',
  door_buzzer: '/audio/metro/door_buzzer.m4a',
  train_arrive: '/audio/metro/train_arrive.m4a',
  pneu_depart: '/audio/metro/pneu_depart.m4a',
};

export function dbToGain(db: number): number {
  if (db <= -72) return 0;
  return Math.pow(10, db / 20);
}

/** Generate a short, natural vaulted-tile stereo impulse response (0.55 s). */
function createVaultImpulse(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.55);
  const ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Fast early reflections + warm exponential tile decay
      const env = Math.pow(1 - t, 3.2) * (i < sr * 0.025 ? 0.55 : 1.0);
      const white = Math.random() * 2 - 1;
      lp = lp * 0.72 + white * 0.28;
      d[i] = lp * env * 0.35;
    }
  }
  return ir;
}

export class MetroAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private pneuGain: GainNode | null = null;
  private ferGain: GainNode | null = null;
  private tunnelFilter: BiquadFilterNode | null = null;
  private tunnelGain: GainNode | null = null;
  private stationGain: GainNode | null = null;
  private reverbSendGain: GainNode | null = null;
  private oneShotGain: GainNode | null = null;

  private pneuSrc: AudioBufferSourceNode | null = null;
  private ferSrc: AudioBufferSourceNode | null = null;
  private tunnelSrc: AudioBufferSourceNode | null = null;
  private stationSrc: AudioBufferSourceNode | null = null;

  private buffers = new Map<SampleKey, AudioBuffer>();
  private loadingPromise: Promise<void> | null = null;
  private loopsStarted = false;

  private enabled = false;
  private disposed = false;
  private prevAtStop = true;
  private prevSpeedKmh = 0;
  private arrivalPlayedForStop = false;
  private departPlayedForRun = false;
  private lastKvbBeepMs = 0;
  private lastCrocodileMs = 0;

  private onVisibilityChange = () => {
    if (!this.ctx || this.disposed) return;
    if (document.hidden) {
      if (this.ctx.state === 'running') {
        void this.ctx.suspend().catch(() => {});
      }
    } else if (this.enabled && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  };

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): boolean {
    if (this.disposed) return false;
    this.enabled = next;
    if (next) {
      this.ensureGraph();
      if (this.ctx && this.ctx.state === 'suspended' && !document.hidden) {
        void this.ctx.resume().catch(() => {});
      }
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(dbToGain(-4), this.ctx.currentTime, 0.12);
      }
      void this.ensureSamplesLoaded();
    } else if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(0, now, 0.08);
      // Suspend AudioContext after fade-out to save battery on iPhone & Mac
      const ctxRef = this.ctx;
      window.setTimeout(() => {
        if (!this.enabled && !this.disposed && ctxRef.state === 'running') {
          void ctxRef.suspend().catch(() => {});
        }
      }, 350);
    }
    return this.enabled;
  }

  private ensureGraph(): void {
    if (this.ctx || typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();

    // Master limiter (-1 dBTP safety ceiling)
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.knee.value = 10;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.12;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(compressor);
    compressor.connect(ctx.destination);

    // Duckable ambience/roll sub-bus (dips subtly under door buzzer)
    const duckGain = ctx.createGain();
    duckGain.gain.value = 1;
    duckGain.connect(masterGain);

    // Vaulted station / tunnel convolution reverb send
    const convolver = ctx.createConvolver();
    convolver.buffer = createVaultImpulse(ctx);
    const reverbSendGain = ctx.createGain();
    reverbSendGain.gain.value = dbToGain(-14);
    reverbSendGain.connect(convolver);
    convolver.connect(masterGain);

    // Rolling bus (pneu + fer stems share dynamic enclosure LP filter)
    const rollFilter = ctx.createBiquadFilter();
    rollFilter.type = 'lowpass';
    rollFilter.frequency.value = 1800;
    rollFilter.Q.value = 0.5;
    rollFilter.connect(duckGain);
    rollFilter.connect(reverbSendGain);

    const pneuGain = ctx.createGain();
    pneuGain.gain.value = 0;
    pneuGain.connect(rollFilter);

    const ferGain = ctx.createGain();
    ferGain.gain.value = 0;
    ferGain.connect(rollFilter);

    // Tunnel airflow bus
    const tunnelFilter = ctx.createBiquadFilter();
    tunnelFilter.type = 'lowpass';
    tunnelFilter.frequency.value = 550;
    const tunnelGain = ctx.createGain();
    tunnelGain.gain.value = 0;
    tunnelGain.connect(tunnelFilter);
    tunnelFilter.connect(duckGain);

    // Station vaulted ambience bus
    const stationGain = ctx.createGain();
    stationGain.gain.value = 0;
    stationGain.connect(duckGain);

    // One-shots bus (door buzzer, arrival brake, departure swell)
    const oneShotGain = ctx.createGain();
    oneShotGain.gain.value = dbToGain(-2);
    oneShotGain.connect(masterGain);
    oneShotGain.connect(reverbSendGain);

    this.ctx = ctx;
    this.masterGain = masterGain;
    this.duckGain = duckGain;
    this.rollFilter = rollFilter;
    this.pneuGain = pneuGain;
    this.ferGain = ferGain;
    this.tunnelFilter = tunnelFilter;
    this.tunnelGain = tunnelGain;
    this.stationGain = stationGain;
    this.reverbSendGain = reverbSendGain;
    this.oneShotGain = oneShotGain;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  private async ensureSamplesLoaded(): Promise<void> {
    if (!this.ctx || this.disposed) return;
    if (this.loopsStarted) return;
    if (this.loadingPromise) return this.loadingPromise;

    const ctx = this.ctx;
    this.loadingPromise = (async () => {
      const entries = Object.entries(SAMPLE_URLS) as Array<[SampleKey, string]>;
      await Promise.all(
        entries.map(async ([key, url]) => {
          if (this.buffers.has(key) || this.disposed) return;
          try {
            const res = await fetch(url);
            if (!res.ok) return;
            const ab = await res.arrayBuffer();
            if (this.disposed) return;
            const decoded = await ctx.decodeAudioData(ab);
            this.buffers.set(key, decoded);
          } catch {
            // Gracefully skip unavailable sample
          }
        })
      );
      if (!this.disposed) {
        this.startLoops();
      }
    })();

    return this.loadingPromise;
  }

  private startLoops(): void {
    if (this.loopsStarted || !this.ctx || this.disposed) return;
    this.loopsStarted = true;

    const spawnLoop = (key: SampleKey, target: AudioNode | null): AudioBufferSourceNode | null => {
      const buf = this.buffers.get(key);
      if (!buf || !target || !this.ctx) return null;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(target);
      src.start();
      return src;
    };

    this.pneuSrc = spawnLoop('pneu_roll', this.pneuGain);
    this.ferSrc = spawnLoop('fer_roll', this.ferGain);
    this.tunnelSrc = spawnLoop('tunnel_ambience', this.tunnelGain);
    this.stationSrc = spawnLoop('station_ambience', this.stationGain);
  }

  private playOneShot(
    key: SampleKey,
    opts: {
      gainDb?: number;
      rateMin?: number;
      rateMax?: number;
      duckDb?: number;
      duckSec?: number;
    } = {}
  ): void {
    if (!this.enabled || !this.ctx || !this.oneShotGain || this.disposed) return;
    const buf = this.buffers.get(key);
    if (!buf) return;

    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const rMin = opts.rateMin ?? 0.985;
    const rMax = opts.rateMax ?? 1.015;
    src.playbackRate.value = rMin + Math.random() * (rMax - rMin);

    const g = this.ctx.createGain();
    g.gain.value = dbToGain(opts.gainDb ?? -3);
    src.connect(g);
    g.connect(this.oneShotGain);
    src.start(now);

    if (opts.duckDb && this.duckGain) {
      const duckDur = opts.duckSec ?? Math.min(2.2, buf.duration);
      this.duckGain.gain.setTargetAtTime(dbToGain(opts.duckDb), now, 0.04);
      this.duckGain.gain.setTargetAtTime(1, now + duckDur, 0.25);
    }
  }

  public updateTelemetry(t: MetroAudioTelemetry): void {
    if (!this.enabled || !this.ctx || this.disposed) return;
    if (this.ctx.state === 'suspended') return;
    const now = this.ctx.currentTime;
    const view: AudioCameraView = t.view ?? 'ride';

    if (t.paused) {
      this.pneuGain?.gain.setTargetAtTime(0, now, 0.14);
      this.ferGain?.gain.setTargetAtTime(0, now, 0.14);
      this.tunnelGain?.gain.setTargetAtTime(0, now, 0.14);
      this.stationGain?.gain.setTargetAtTime(dbToGain(-26), now, 0.2);
      return;
    }

    const vNorm = Math.min(1, Math.max(0, t.speedKmh / 68));
    const isMoving = !t.atStop && t.speedKmh >= 1.2;

    // Trigger authentic station arrival braking when slowing down into a stop
    if (!t.atStop && t.speedKmh < 24 && this.prevSpeedKmh >= 24 && !this.arrivalPlayedForStop) {
      this.arrivalPlayedForStop = true;
      this.departPlayedForRun = false;
      this.playOneShot('train_arrive', {
        gainDb: view === 'vault' ? -5 : -8,
        rateMin: 0.97,
        rateMax: 1.03,
      });
    }

    // Trigger authentic departure swell when leaving a station
    if (this.prevAtStop && !t.atStop && t.speedKmh > 2 && !this.departPlayedForRun) {
      this.departPlayedForRun = true;
      this.arrivalPlayedForStop = false;
      if (t.isPneumatic) {
        this.playOneShot('pneu_depart', {
          gainDb: view === 'vault' ? -4 : -7,
          rateMin: 0.98,
          rateMax: 1.02,
        });
      }
    }

    if (t.atStop) {
      this.arrivalPlayedForStop = false;
      this.departPlayedForRun = false;
    }
    this.prevAtStop = t.atStop;
    this.prevSpeedKmh = t.speedKmh;

    // 1. Authentic rolling / traction crossfade (pneu vs steel rail)
    const rollDb = isMoving ? -20 + Math.pow(vNorm, 0.72) * 16 : -72;
    const viewRollOffsetDb = view === 'vault' ? -2 : view === 'passenger' ? -1.5 : 0;
    const activeRollLinear = dbToGain(rollDb + viewRollOffsetDb);

    this.pneuGain?.gain.setTargetAtTime(t.isPneumatic ? activeRollLinear : 0, now, 0.14);
    this.ferGain?.gain.setTargetAtTime(t.isPneumatic ? 0 : activeRollLinear, now, 0.14);

    // Keep playbackRate in natural organic bounds (0.80..1.20) so recordings never sound synthetic
    const naturalRate = 0.8 + vNorm * 0.38;
    if (this.pneuSrc) {
      this.pneuSrc.playbackRate.setTargetAtTime(naturalRate, now, 0.15);
    }
    if (this.ferSrc) {
      this.ferSrc.playbackRate.setTargetAtTime(0.84 + vNorm * 0.32, now, 0.15);
    }

    // Enclosure / air acoustics filter
    const cutoff = t.isOpenAir
      ? 3600 + vNorm * 2400
      : view === 'vault'
        ? 2400 + vNorm * 1600
        : view === 'passenger'
          ? 1450 + vNorm * 1250
          : 1850 + vNorm * 1650;
    this.rollFilter?.frequency.setTargetAtTime(cutoff, now, 0.16);

    // 2. Tunnel airflow rush (strong underground at high speed, quiet on open-air viaduct)
    const tunnelDb = isMoving && !t.isOpenAir ? -26 + vNorm * 15 : -72;
    this.tunnelGain?.gain.setTargetAtTime(dbToGain(tunnelDb), now, 0.18);
    this.tunnelFilter?.frequency.setTargetAtTime(280 + vNorm * 480, now, 0.2);

    // 3. Real Paris Metro station ambience (present at stops & in Quai view, dips smoothly in deep tunnel)
    const stationDb = view === 'vault' ? (t.atStop ? -8 : -13) : t.atStop ? -12 : -28;
    this.stationGain?.gain.setTargetAtTime(dbToGain(stationDb), now, 0.28);

    // 4. Vault reverb send: authentic station/tunnel resonance, dry on open-air viaducts
    const reverbDb = t.isOpenAir ? -38 : view === 'vault' ? -9 : -15;
    this.reverbSendGain?.gain.setTargetAtTime(dbToGain(reverbDb), now, 0.22);
  }

  /** Authentic RATP 600 Hz door closing buzzer recorded in Paris station. */
  public triggerDoorChime(): void {
    this.playOneShot('door_buzzer', {
      gainDb: -3,
      rateMin: 0.992,
      rateMax: 1.008,
      duckDb: -4.5,
      duckSec: 1.7,
    });
  }

  /** Dual-tone RATP Metro or SNCF RER warning horn routed through the vaulted limiter bus. */
  public triggerHorn(isRer: boolean): void {
    if (!this.enabled || !this.ctx || !this.oneShotGain || this.disposed) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = isRer ? 0.6 : 0.45;
    const freqs = isRer ? [370, 466] : [415, 523];
    const cutoff = isRer ? 1400 : 1600;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, now);

    const env = ctx.createGain();
    const peak = dbToGain(-6);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(peak, now + 0.035);
    env.gain.setValueAtTime(peak, now + dur - 0.12);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    filter.connect(env);
    env.connect(this.oneShotGain);

    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = isRer ? (idx === 0 ? 'sawtooth' : 'triangle') : idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + dur + 0.03);
    });
  }

  /** Crisp mechanical manipulateur notch detent click (heavier thud on emergency brake). */
  public triggerNotchClick(isEmergency: boolean): void {
    if (!this.enabled || !this.ctx || !this.oneShotGain || this.disposed) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    osc.type = isEmergency ? 'triangle' : 'square';
    osc.frequency.setValueAtTime(isEmergency ? 260 : 950, now);
    osc.frequency.exponentialRampToValueAtTime(isEmergency ? 110 : 420, now + 0.022);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isEmergency ? 280 : 950, now);
    filter.Q.setValueAtTime(1.8, now);

    const peak = dbToGain(isEmergency ? -11 : -15);
    env.gain.setValueAtTime(peak, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + (isEmergency ? 0.05 : 0.024));

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.oneShotGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /** KVB overspeed double-beep, internally throttled to avoid fatigue. */
  public triggerKvbBeep(): void {
    if (!this.enabled || !this.ctx || !this.oneShotGain || this.disposed) return;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - this.lastKvbBeepMs < 1200) return;
    this.lastKvbBeepMs = nowMs;

    const ctx = this.ctx;
    const base = ctx.currentTime;
    const peak = dbToGain(-12);

    [0, 0.1].forEach((offset) => {
      const start = base + offset;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1850, start);
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(peak, start + 0.008);
      env.gain.setValueAtTime(peak, start + 0.052);
      env.gain.exponentialRampToValueAtTime(0.0001, start + 0.068);
      osc.connect(env);
      env.connect(this.oneShotGain!);
      osc.start(start);
      osc.stop(start + 0.075);
    });
  }

  /**
   * Authentic French SNCF/RATP cab signal repetition ("crocodile") chime:
   * short high pure tone (~2200 Hz, 140 ms, soft -14 dB), throttled at 1600 ms.
   */
  public triggerCrocodileChime(): void {
    if (!this.enabled || !this.ctx || !this.oneShotGain || this.disposed) return;
    if (this.ctx.state === 'suspended') return;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - this.lastCrocodileMs < 1600) return;
    this.lastCrocodileMs = nowMs;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const peak = dbToGain(-14);

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2200, now);

    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(peak, now + 0.008);
    env.gain.setValueAtTime(peak, now + 0.045);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    osc.connect(env);
    env.connect(this.oneShotGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Warm subtle 3-note ascending RATP-style confirmation chime (-12 dB, ~0.55 s)
   * played when a driving mission completes cleanly.
   */
  public triggerMissionCompleteChime(): void {
    if (!this.enabled || !this.ctx || !this.oneShotGain || this.disposed) return;
    if (this.ctx.state === 'suspended') return;

    const ctx = this.ctx;
    const base = ctx.currentTime;
    const peak = dbToGain(-12);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, base);
    filter.connect(this.oneShotGain);

    const notes: Array<{ freq: number; offset: number; dur: number }> = [
      { freq: 523.25, offset: 0.0, dur: 0.18 }, // C5
      { freq: 659.25, offset: 0.13, dur: 0.18 }, // E5
      { freq: 783.99, offset: 0.26, dur: 0.29 }, // G5 (ends at 0.55 s)
    ];

    notes.forEach(({ freq, offset, dur }) => {
      const start = base + offset;
      const sineOsc = ctx.createOscillator();
      const triOsc = ctx.createOscillator();
      const sineGain = ctx.createGain();
      const triGain = ctx.createGain();
      const noteEnv = ctx.createGain();

      sineOsc.type = 'sine';
      sineOsc.frequency.setValueAtTime(freq, start);
      sineGain.gain.setValueAtTime(0.78, start);

      triOsc.type = 'triangle';
      triOsc.frequency.setValueAtTime(freq, start);
      triGain.gain.setValueAtTime(0.22, start);

      noteEnv.gain.setValueAtTime(0.0001, start);
      noteEnv.gain.exponentialRampToValueAtTime(peak, start + 0.016);
      noteEnv.gain.exponentialRampToValueAtTime(peak * 0.45, start + dur * 0.55);
      noteEnv.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      sineOsc.connect(sineGain);
      triOsc.connect(triGain);
      sineGain.connect(noteEnv);
      triGain.connect(noteEnv);
      noteEnv.connect(filter);

      sineOsc.start(start);
      triOsc.start(start);
      sineOsc.stop(start + dur + 0.02);
      triOsc.stop(start + dur + 0.02);
    });
  }

  /**
   * Warm, gentle RATP/SIVE 2-note ASVA announcement chime:
   * E5 (659.25 Hz, 0.00s, dur 0.16s) -> C5 (523.25 Hz, 0.14s, dur 0.28s)
   * through a 2200 Hz lowpass filter at -14 dB, while ducking rolling ambience
   * by -4 dB for 2.6 s so spoken announcements sit cleanly above noise.
   */
  public triggerAsvaChime(): void {
    if (!this.enabled || !this.ctx || !this.oneShotGain || this.disposed) return;
    if (this.ctx.state === 'suspended') return;

    const ctx = this.ctx;
    const base = ctx.currentTime;
    const peak = dbToGain(-14);

    if (this.duckGain) {
      this.duckGain.gain.cancelScheduledValues?.(base);
      this.duckGain.gain.setTargetAtTime(dbToGain(-4), base, 0.06);
      this.duckGain.gain.setTargetAtTime(1, base + 2.6, 0.32);
    }

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, base);
    filter.connect(this.oneShotGain);

    const notes: Array<{ freq: number; offset: number; dur: number }> = [
      { freq: 659.25, offset: 0.0, dur: 0.16 }, // E5
      { freq: 523.25, offset: 0.14, dur: 0.28 }, // C5
    ];

    notes.forEach(({ freq, offset, dur }) => {
      const start = base + offset;
      const sineOsc = ctx.createOscillator();
      const triOsc = ctx.createOscillator();
      const sineGain = ctx.createGain();
      const triGain = ctx.createGain();
      const noteEnv = ctx.createGain();

      sineOsc.type = 'sine';
      sineOsc.frequency.setValueAtTime(freq, start);
      sineGain.gain.setValueAtTime(0.8, start);

      triOsc.type = 'triangle';
      triOsc.frequency.setValueAtTime(freq, start);
      triGain.gain.setValueAtTime(0.2, start);

      noteEnv.gain.setValueAtTime(0.0001, start);
      noteEnv.gain.exponentialRampToValueAtTime(peak, start + 0.015);
      noteEnv.gain.exponentialRampToValueAtTime(peak * 0.45, start + dur * 0.55);
      noteEnv.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      sineOsc.connect(sineGain);
      triOsc.connect(triGain);
      sineGain.connect(noteEnv);
      triGain.connect(noteEnv);
      noteEnv.connect(filter);

      sineOsc.start(start);
      triOsc.start(start);
      sineOsc.stop(start + dur + 0.02);
      triOsc.stop(start + dur + 0.02);
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    try {
      this.pneuSrc?.stop();
      this.ferSrc?.stop();
      this.tunnelSrc?.stop();
      this.stationSrc?.stop();
      void this.ctx?.close();
    } catch {
      // ignore teardown errors
    }
    this.buffers.clear();
    this.ctx = null;
  }
}
