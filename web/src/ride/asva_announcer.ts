/**
 * RATP ASVA / SIVE onboard audio announcement formatter & Web Speech API driver.
 *
 * Purely optional / defensive: safely degrades to a clean no-op when
 * `window.speechSynthesis` or `SpeechSynthesisUtterance` is unavailable or blocked.
 */

export type AsvaPhase = 'approach' | 'arrival';

export function formatAsvaText(stationName: string, phase: AsvaPhase, isTerminus = false): string {
  if (phase === 'approach') {
    return `Prochaine station : ${stationName}${isTerminus ? ', terminus' : ''}.`;
  }
  return `${stationName}${isTerminus ? ', terminus.' : '.'}`;
}

const PREFERRED_VOICE_NAMES = ['thomas', 'amelie', 'audrey', 'google francais'];

function normalizeVoiceText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function pickBestFrenchVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  const frFrVoices = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === 'fr-fr');
  for (const target of PREFERRED_VOICE_NAMES) {
    const hit = frFrVoices.find((v) => normalizeVoiceText(v.name).includes(target));
    if (hit) return hit;
  }
  if (frFrVoices.length > 0) return frFrVoices[0];

  const anyFrVoices = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('fr'));
  for (const target of PREFERRED_VOICE_NAMES) {
    const hit = anyFrVoices.find((v) => normalizeVoiceText(v.name).includes(target));
    if (hit) return hit;
  }
  return anyFrVoices[0] ?? null;
}

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  try {
    return 'speechSynthesis' in window && window.speechSynthesis ? window.speechSynthesis : null;
  } catch {
    return null;
  }
}

export class AsvaAnnouncer {
  private lastSpokenKey: string | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private cachedVoice: SpeechSynthesisVoice | null = null;
  private disposed = false;

  private clearPendingTimer(): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  private resolveVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
    if (this.cachedVoice) return this.cachedVoice;
    try {
      const voices = synth.getVoices();
      const picked = pickBestFrenchVoice(voices);
      if (picked) this.cachedVoice = picked;
      return picked;
    } catch {
      return null;
    }
  }

  private speak(text: string, rate: number, pitch: number, volume: number): void {
    if (this.disposed) return;
    const synth = getSpeechSynthesis();
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;

    try {
      synth.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'fr-FR';
      utt.rate = rate;
      utt.pitch = pitch;
      utt.volume = volume;
      const voice = this.resolveVoice(synth);
      if (voice) utt.voice = voice;
      synth.speak(utt);
    } catch {
      // Safe no-op in restricted/private environments
    }
  }

  public announceApproach(
    stationName: string,
    opts?: { isTerminus?: boolean; onChime?: () => void }
  ): void {
    if (this.disposed || !stationName) return;
    const key = `${stationName}::approach`;
    if (this.lastSpokenKey === key) return;
    this.lastSpokenKey = key;

    opts?.onChime?.();
    this.clearPendingTimer();

    const text = formatAsvaText(stationName, 'approach', opts?.isTerminus);
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      if (this.disposed) return;
      this.speak(text, 0.98, 1.08, 0.88);
    }, 380);
  }

  public announceArrival(stationName: string, opts?: { isTerminus?: boolean }): void {
    if (this.disposed || !stationName) return;
    const key = `${stationName}::arrival`;
    if (this.lastSpokenKey === key) return;
    this.lastSpokenKey = key;

    this.clearPendingTimer();
    const text = formatAsvaText(stationName, 'arrival', opts?.isTerminus);
    this.speak(text, 0.94, 0.94, 0.85);
  }

  public cancel(): void {
    this.clearPendingTimer();
    const synth = getSpeechSynthesis();
    if (!synth) return;
    try {
      synth.cancel();
    } catch {
      // Ignore teardown / restricted browser errors
    }
  }

  public reset(): void {
    this.lastSpokenKey = null;
    this.cancel();
  }

  public dispose(): void {
    this.disposed = true;
    this.reset();
    this.cachedVoice = null;
  }
}
