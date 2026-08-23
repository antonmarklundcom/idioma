'use client';

import { useEffect, useRef } from 'react';
import { SILENCE_STOP_MS, useRecorder } from './useRecorder';
import { t, type Locale } from '@/lib/i18n';

export function UtteranceRecorder({
  onRecorded,
  onBeforeStart,
  disabled,
  sending = false,
  locale,
  handsFree = false,
  autoStartToken,
  onAbandoned,
}: {
  /** `spokenSeconds` is how long the mic was actually capturing - the speaking-time metric. */
  onRecorded: (blob: Blob, mimeType: string, spokenSeconds: number) => void;
  /** Called synchronously inside the tap handler, before recording starts - use
   * this to unlock audio playback for iOS (PLAN.md §4.5), which requires the
   * unlock to happen inside the same user-gesture call stack. */
  onBeforeStart?: () => void;
  disabled?: boolean;
  /**
   * Drives the idle-state label from the PARENT's request status, not the recorder's
   * own 'stopped' status - the recorder never transitions back to 'idle' on its own
   * after handing off a blob, so relying on it left the label stuck on "Sending…"
   * forever once the parent had already shown feedback or an error.
   */
  sending?: boolean;
  locale: Locale;
  /**
   * PLAN.md §8 Phase 7B item 2: auto-stop the turn on silence. Per-user setting,
   * default ON in /live and OFF in /lesson - in a graded exercise a thinking pause
   * must not end the turn.
   */
  handsFree?: boolean;
  /**
   * Change this value to open the mic without a tap (the "no taps between turns"
   * half of hands-free). Only honoured while `handsFree` is on; the initial value
   * never auto-starts, so the first turn is still a deliberate tap - which is also
   * what unlocks audio playback on iOS.
   */
  autoStartToken?: number;
  /** Hands-free only: the mic opened, nobody spoke, and the turn was dropped. */
  onAbandoned?: () => void;
}) {
  const strings = t(locale).recorder;
  const { status, level, elapsedSeconds, silenceCountdownMs, error, start, stop, maxSeconds } =
    useRecorder(onRecorded, strings.micDenied, { handsFree, onAbandoned });

  const isCapturing = status === 'recording';
  const isListening = status === 'listening';
  const isOpen = isCapturing || isListening;

  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const lastTokenRef = useRef(autoStartToken);
  useEffect(() => {
    if (autoStartToken === undefined || autoStartToken === lastTokenRef.current) return;
    lastTokenRef.current = autoStartToken;
    if (!handsFree || disabled) return;
    startRef.current();
  }, [autoStartToken, handsFree, disabled]);

  const countdownSeconds =
    silenceCountdownMs === null ? null : (Math.ceil(silenceCountdownMs / 100) / 10).toFixed(1);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        disabled={disabled || status === 'requesting'}
        onClick={() => {
          if (isOpen) {
            stop();
          } else {
            onBeforeStart?.();
            start();
          }
        }}
        className={`relative flex size-24 cursor-pointer items-center justify-center rounded-full text-3xl text-white shadow-raised transition-transform duration-100 active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${
          isOpen ? 'animate-pop bg-brand-600' : 'bg-brand-500 hover:bg-brand-400'
        }`}
        aria-label={isOpen ? strings.stopRecording : strings.startRecording}
      >
        {isOpen ? '■' : '🎙️'}
        {silenceCountdownMs !== null && (
          // Visible countdown so the auto-stop is never a surprise (PLAN.md §8 Phase 7B).
          <span
            className="absolute inset-0 rounded-full border-4 border-white/70"
            style={{ opacity: 1 - silenceCountdownMs / SILENCE_STOP_MS }}
            aria-hidden
          />
        )}
      </button>

      {isOpen && (
        <div className="flex w-full max-w-xs flex-col items-center gap-1">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full bg-success-500 transition-[width] duration-75"
              style={{ width: `${Math.min(100, level * 140)}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-ink-muted" aria-live="polite">
            {isListening
              ? strings.waitingForSpeech
              : countdownSeconds !== null
                ? strings.autoStopIn(countdownSeconds)
                : `${elapsedSeconds}s / ${maxSeconds}s`}
          </span>
        </div>
      )}

      {!isOpen && status !== 'requesting' && (
        <p className="text-sm font-semibold text-ink-muted" aria-live="polite">
          {sending ? strings.sending : strings.tapToRecord}
        </p>
      )}

      {error && (
        <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">{error}</p>
      )}
    </div>
  );
}
