/**
 * The app's own small sounds - a tap, a good answer, a miss, a finished lesson.
 *
 * Synthesized in the browser with two oscillators rather than shipped as audio files.
 * The reasons are practical: nothing to download on a Paraguayan mobile connection,
 * nothing to cache for offline, no licences, and no way for a sound to be missing
 * because a request failed. The whole "sound pack" is the table below.
 *
 * These are NOT the tutor's voice (that is Cloud TTS, server-side). They never carry
 * meaning on their own: every one of them accompanies something already written on
 * screen, so a learner with sound off - or a phone on silent - loses nothing.
 */

export type UiSound =
  /** A control was pressed and something is now happening. */
  | 'tap'
  /** The microphone just opened. */
  | 'listening'
  /** The recording was taken and is on its way. */
  | 'sent'
  /** The turn came back clean. */
  | 'success'
  /** The turn came back with corrections - a nudge, never a buzzer. */
  | 'miss'
  /** Something went wrong: the request failed, the audio would not load. */
  | 'error'
  /** The lesson is finished. */
  | 'complete';

type Tone = {
  /** Hz. Two entries = a small melody, played in order. */
  freqs: number[];
  /** Seconds per note. */
  noteSeconds: number;
  /** 0-1, before the envelope. Deliberately quiet - this plays next to a voice. */
  gain: number;
  type: OscillatorType;
};

/**
 * Rising intervals for good news, falling for bad, one flat note for acknowledgement.
 * Nothing is longer than half a second: a sound the learner has to wait out is a sound
 * they will turn off by the third lesson.
 */
export const TONES: Record<UiSound, Tone> = {
  tap: { freqs: [660], noteSeconds: 0.05, gain: 0.12, type: 'sine' },
  listening: { freqs: [520, 780], noteSeconds: 0.07, gain: 0.14, type: 'sine' },
  sent: { freqs: [780, 520], noteSeconds: 0.06, gain: 0.12, type: 'sine' },
  success: { freqs: [660, 880, 1320], noteSeconds: 0.09, gain: 0.16, type: 'sine' },
  miss: { freqs: [520, 415], noteSeconds: 0.11, gain: 0.14, type: 'triangle' },
  error: { freqs: [340, 260], noteSeconds: 0.13, gain: 0.15, type: 'triangle' },
  complete: { freqs: [523, 659, 784, 1047], noteSeconds: 0.1, gain: 0.18, type: 'sine' },
};

/** How long a sound occupies the speaker, in seconds. */
export function toneDuration(sound: UiSound): number {
  const tone = TONES[sound];
  return tone.freqs.length * tone.noteSeconds;
}

/** Per-device, not per-account: whether sound suits you depends on the room you are in. */
export const SOUND_STORAGE_KEY = 'idioma:ui-sounds';

/**
 * Sound is ON unless this device has said otherwise. Storage can throw outright in a
 * locked-down browser, so every read is guarded and an unreadable setting means "on" -
 * the same thing a first-time visitor gets.
 */
export function readSoundPreference(): boolean {
  try {
    return globalThis.localStorage?.getItem(SOUND_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeSoundPreference(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(SOUND_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // A device that cannot remember the choice still honours it for this session.
  }
}

let context: AudioContext | null = null;

/**
 * Plays one sound, or does nothing at all - which is the important half. A browser
 * with no Web Audio, a context iOS refuses to start, a tab in the background: all of
 * them return quietly rather than throwing into a click handler.
 */
export function playUiSound(sound: UiSound, enabled: boolean): void {
  if (!enabled) return;
  try {
    const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    // Created inside a tap handler the first time, so iOS starts it running; later
    // sounds may find it suspended after a lock/unlock and need this nudge.
    if (context.state === 'suspended') void context.resume().catch(() => {});

    const tone = TONES[sound];
    const now = context.currentTime;
    tone.freqs.forEach((freq, i) => {
      const start = now + i * tone.noteSeconds;
      const end = start + tone.noteSeconds;
      const osc = context!.createOscillator();
      const amp = context!.createGain();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(freq, start);
      // A hard start and stop on a sine wave is an audible click at both ends, which
      // is louder than the note itself. This is the fade that removes it.
      amp.gain.setValueAtTime(0, start);
      amp.gain.linearRampToValueAtTime(tone.gain, start + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(amp).connect(context!.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    });
  } catch {
    // Sound is decoration. It never gets to break the thing it decorates.
  }
}
