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
}: {
  onRecorded: (blob: Blob, mimeType: string) => void;
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
}) {
  const strings = t(locale).recorder;
  const { status, level, elapsedSeconds, silenceCountdownMs, error, start, stop, maxSeconds } =
    useRecorder(onRecorded, strings.micDenied, { handsFree });

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
        className={`relative flex h-20 w-20 items-center justify-center rounded-full text-3xl text-white transition disabled:opacity-50 ${
          isOpen ? 'bg-red-500' : 'bg-sky-600'
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
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full bg-sky-500 transition-[width] duration-75"
              style={{ width: `${Math.min(100, level * 140)}%` }}
            />
          </div>
          <span className="text-xs text-slate-400" aria-live="polite">
            {isListening
              ? strings.waitingForSpeech
              : countdownSeconds !== null
                ? strings.autoStopIn(countdownSeconds)
                : `${elapsedSeconds}s / ${maxSeconds}s`}
          </span>
        </div>
      )}

      {!isOpen && status !== 'requesting' && (
        <p className="text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
          {sending ? strings.sending : strings.tapToRecord}
        </p>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
