'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UtteranceRecorder } from '@/components/recorder/UtteranceRecorder';
import { t, type Locale } from '@/lib/i18n';
import type { LessonVocabItem } from '@/lib/srs';

/**
 * Shadowing (ROADMAP.md P1.5b follow-on item 3): hear a native line, say it back
 * immediately, then hear both.
 *
 * Nothing here is graded and nothing is uploaded - no model call, no attempt row, no
 * quota. That is the point: shadowing is worth doing twenty times in a row, which it
 * would not be if every repetition cost a graded turn against the daily cap (§6.5).
 * The term audio comes from the lesson's own audio route, already cached per slot by
 * the caller, so a second pass through the list costs no synthesis either.
 */
export function ShadowRun({
  vocab,
  locale,
  playTerm,
  onExit,
}: {
  vocab: LessonVocabItem[];
  locale: Locale;
  /** Plays one vocab item by index and calls back when it finishes (or fails). */
  playTerm: (index: number, onEnded: () => void) => void;
  onExit: () => void;
}) {
  const strings = t(locale).shadowing;
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'listening' | 'speaking' | 'compare'>('listening');
  const [ownUrl, setOwnUrl] = useState<string | null>(null);
  // Bumped to open the mic without a tap, the moment the native version finishes.
  const [micToken, setMicToken] = useState(0);
  const ownAudioRef = useRef<HTMLAudioElement | null>(null);

  const item = vocab[index];
  const isLast = index === vocab.length - 1;

  // One object URL at a time: a ten-word run would otherwise hold ten recordings.
  useEffect(() => {
    return () => {
      ownAudioRef.current?.pause();
      if (ownUrl) URL.revokeObjectURL(ownUrl);
    };
  }, [ownUrl]);

  const hearNative = useCallback(
    (onEnded?: () => void) => {
      playTerm(index, () => onEnded?.());
    },
    [playTerm, index],
  );

  // Play the word, then hand the mic over. Re-runs when the index changes, which is
  // what makes "next word" a single tap rather than three.
  useEffect(() => {
    if (phase !== 'listening') return;
    let cancelled = false;
    playTerm(index, () => {
      if (cancelled) return;
      setPhase('speaking');
      setMicToken((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [phase, index, playTerm]);

  // Plain functions, not useCallback: the React Compiler memoizes them, and hand-written
  // dependency lists here only stop it from doing so.
  const handleRecorded = (blob: Blob) => {
    setOwnUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(blob);
    });
    setPhase('compare');
  };

  const playOwn = useCallback(() => {
    if (!ownUrl) return;
    // Inside the tap's own call stack, so iOS allows it (PLAN.md §4.5).
    const audio = (ownAudioRef.current ??= new Audio());
    audio.src = ownUrl;
    audio.play().catch(() => {});
  }, [ownUrl]);

  const goTo = (next: number) => {
    setOwnUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setIndex(next);
    setPhase('listening');
  };

  if (!item) return null;

  return (
    <div className="flex w-full flex-1 flex-col items-center gap-4 py-6">
      <div className="flex w-full items-center justify-between">
        <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
          {strings.progress(index + 1, vocab.length)}
        </p>
        <button
          type="button"
          onClick={onExit}
          className="-my-1 cursor-pointer px-2 py-1 text-sm font-bold text-ink-muted"
        >
          {strings.exit}
        </button>
      </div>

      <p className="text-3xl font-extrabold text-balance text-ink">{item.term}</p>
      <p className="text-sm text-ink-muted">{item.gloss}</p>

      {phase === 'listening' && (
        <p className="text-sm font-semibold text-ink-muted" aria-live="polite">
          {strings.listenFirst}
        </p>
      )}

      {phase === 'speaking' && (
        <p className="text-sm font-semibold text-ink-muted" aria-live="polite">
          {strings.nowYou}
        </p>
      )}

      {/* Mounted for the whole run, shown only when it is the learner's turn: the
          recorder auto-starts on a CHANGE of `autoStartToken`, so a component mounted
          with the new value already in hand would sit there waiting for a tap. */}
      <div className={phase === 'speaking' ? 'contents' : 'hidden'}>
        <UtteranceRecorder
          onRecorded={handleRecorded}
          locale={locale}
          handsFree
          autoStartToken={micToken}
          // Walking away mid-run just returns the word to the "play it again" state:
          // nothing was said, so there is nothing to compare.
          onAbandoned={() => setPhase('listening')}
        />
      </div>

      {phase === 'compare' && (
        <div className="flex w-full max-w-sm flex-col gap-2">
          {/* The comparison is the whole exercise, so both buttons are equals - the
              learner decides how many times to go back and forth. */}
          <button type="button" onClick={() => hearNative()} className="btn-secondary">
            {strings.hearNative}
          </button>
          <button type="button" onClick={playOwn} className="btn-secondary">
            {strings.hearYourself}
          </button>
          <button
            type="button"
            onClick={() => (isLast ? onExit() : goTo(index + 1))}
            className="btn-primary"
          >
            {isLast ? strings.finish : strings.nextWord}
          </button>
          <button
            type="button"
            onClick={() => goTo(index)}
            className="-my-1 cursor-pointer px-2 py-1 text-sm font-bold text-ink-muted"
          >
            {strings.tryAgain}
          </button>
        </div>
      )}
    </div>
  );
}
