'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UtteranceRecorder } from '@/components/recorder/UtteranceRecorder';
import { useSpeakingTimeBeacon } from '@/components/practice/useSpeakingTimeBeacon';
import { useUiSounds } from '@/components/ui/useUiSounds';
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
 *
 * One number does leave: how long the learner spoke. "Nothing is uploaded" used to
 * include that, which made the family's most-repeated practice the practice the
 * dashboard could not see - somebody who shadowed twenty words was told they had
 * spoken for zero minutes. The seconds go out as a single sum at the end of the run
 * (`useSpeakingTimeBeacon`), and buy nothing: no XP, no streak, no graded turn.
 */
export function ShadowRun({
  vocab,
  locale,
  playTerm,
  audioBroken,
  onExit,
}: {
  vocab: LessonVocabItem[];
  locale: Locale;
  /** Plays one vocab item by index and calls back when it finishes (or fails). */
  playTerm: (index: number, onEnded: () => void) => void;
  /**
   * True once the lesson's audio has failed. Shadowing is "hear it, say it back" -
   * with nothing to hear there is no exercise, only a mic opening at someone for no
   * reason, so the run stops and says why.
   */
  audioBroken: boolean;
  onExit: () => void;
}) {
  const strings = t(locale).shadowing;
  const [index, setIndex] = useState(0);
  // 'paused' is where an unanswered turn lands. It is deliberately a dead end until
  // the learner taps: the mic reopening on its own, forever, is exactly what walking
  // away from the phone used to produce.
  const [phase, setPhase] = useState<'listening' | 'speaking' | 'compare' | 'paused'>('listening');
  const [ownUrl, setOwnUrl] = useState<string | null>(null);
  // Bumped to open the mic without a tap, the moment the native version finishes.
  const [micToken, setMicToken] = useState(0);
  const ownAudioRef = useRef<HTMLAudioElement | null>(null);

  const sound = useUiSounds();
  const { addSpokenSeconds, flushSpeakingTime } = useSpeakingTimeBeacon();
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
    if (phase !== 'listening' || audioBroken) return;
    let cancelled = false;
    playTerm(index, () => {
      if (cancelled) return;
      setPhase('speaking');
      setMicToken((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [phase, index, playTerm, audioBroken]);

  // Plain functions, not useCallback: the React Compiler memoizes them, and hand-written
  // dependency lists here only stop it from doing so.
  const handleRecorded = (blob: Blob, _mimeType: string, spokenSeconds: number) => {
    addSpokenSeconds(spokenSeconds);
    sound('sent');
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

  // The run is over, so the minutes go now rather than whenever this component
  // happens to unmount. The beacon still flushes on unmount and on `pagehide` as a
  // backstop, and reporting twice is not possible - it clears what it sends.
  const exitRun = () => {
    flushSpeakingTime();
    onExit();
  };

  const goTo = (next: number) => {
    setOwnUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setIndex(next);
    setPhase('listening');
  };

  if (!item) return null;

  // Nothing to shadow. Said plainly, with the way out, instead of a mic that keeps
  // opening on a word the learner cannot hear.
  if (audioBroken) {
    return (
      <div className="flex w-full flex-1 flex-col items-center gap-4 py-8">
        <p className="max-w-sm text-center text-sm text-ink-muted">{strings.audioBroken}</p>
        <button type="button" onClick={exitRun} className="btn-primary">
          {strings.exit}
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col items-center gap-4 py-6">
      <div className="flex w-full items-center justify-between">
        <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
          {strings.progress(index + 1, vocab.length)}
        </p>
        <button
          type="button"
          onClick={exitRun}
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

      {/* The mic opened, heard nothing, and stopped. It does NOT reopen by itself:
          one unanswered turn means nobody is there, and the next one is a tap. */}
      {phase === 'paused' && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-semibold text-ink-muted" aria-live="polite">
            {strings.pausedNoSpeech}
          </p>
          <button type="button" onClick={() => goTo(index)} className="btn-primary">
            {strings.resume}
          </button>
        </div>
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
          // Nobody spoke. Stop, and wait to be asked again - going back to
          // 'listening' would replay the word and reopen the mic, and keep doing
          // that for as long as the learner is out of the room.
          onAbandoned={() => setPhase('paused')}
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
            onClick={() => (isLast ? exitRun() : goTo(index + 1))}
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
