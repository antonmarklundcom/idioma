'use client';

import { useRecorder } from './useRecorder';
import { t, type Locale } from '@/lib/i18n';

export function UtteranceRecorder({
  onRecorded,
  onBeforeStart,
  disabled,
  locale,
}: {
  onRecorded: (blob: Blob, mimeType: string) => void;
  /** Called synchronously inside the tap handler, before recording starts - use
   * this to unlock audio playback for iOS (PLAN.md §4.5), which requires the
   * unlock to happen inside the same user-gesture call stack. */
  onBeforeStart?: () => void;
  disabled?: boolean;
  locale: Locale;
}) {
  const strings = t(locale).recorder;
  const { status, level, elapsedSeconds, error, start, stop, maxSeconds } = useRecorder(
    onRecorded,
    strings.micDenied,
  );

  const isRecording = status === 'recording';

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        disabled={disabled || status === 'requesting'}
        onClick={() => {
          if (isRecording) {
            stop();
          } else {
            onBeforeStart?.();
            start();
          }
        }}
        className={`flex h-20 w-20 items-center justify-center rounded-full text-3xl text-white transition disabled:opacity-50 ${
          isRecording ? 'bg-red-500' : 'bg-sky-600'
        }`}
        aria-label={isRecording ? strings.stopRecording : strings.startRecording}
      >
        {isRecording ? '■' : '🎙️'}
      </button>

      {isRecording && (
        <div className="flex w-full max-w-xs flex-col items-center gap-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full bg-sky-500 transition-[width] duration-75"
              style={{ width: `${Math.min(100, level * 140)}%` }}
            />
          </div>
          <span className="text-xs text-slate-400">
            {elapsedSeconds}s / {maxSeconds}s
          </span>
        </div>
      )}

      {!isRecording && status !== 'requesting' && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {status === 'stopped' ? strings.sending : strings.tapToRecord}
        </p>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
