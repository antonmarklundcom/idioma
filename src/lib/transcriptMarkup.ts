import type { UtteranceError } from '@/lib/db/schema';

/**
 * Marking up what the learner actually said (ROADMAP.md P1.5 follow-on).
 *
 * The feedback already carries `errors[].quote` - the exact span the tutor objected
 * to - but until now it was only ever listed underneath the transcript, so the
 * learner had to find the words again themselves. This turns one transcript plus its
 * errors into a flat list of segments, so the UI can render the sentence once with
 * the wrong parts marked in place: a teacher's red pen over their own speech.
 *
 * It is pure, and deliberately lives outside the component: getting this wrong is
 * silent (the sentence still renders, it just marks the wrong words), which is
 * exactly the kind of bug a test catches and an eyeball does not.
 */

export type TranscriptSegment = {
  text: string;
  /** Present when this span is what an error quoted. */
  error?: UtteranceError;
};

export type MarkedUpTranscript = {
  segments: TranscriptSegment[];
  /**
   * Errors whose `quote` could not be located in the transcript - the model quoted
   * loosely, or quoted the corrected form. They are NOT dropped: the caller still
   * lists them, they just have no span to sit on.
   */
  unmatched: UtteranceError[];
};

/**
 * Case- and accent-insensitive, because a quote that differs from the transcript
 * only by "está"/"esta" is the model being inconsistent about its own output, not a
 * different phrase. Length is preserved character-for-character (NFD combining marks
 * are stripped, everything else maps 1:1) so an index into the folded string is a
 * valid index into the original.
 */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

type Match = { start: number; end: number; error: UtteranceError };

export function markUpTranscript(
  transcript: string,
  errors: UtteranceError[] = [],
): MarkedUpTranscript {
  if (!transcript) return { segments: [], unmatched: errors.filter((e) => e.quote) };

  const foldedTranscript = fold(transcript);
  const matches: Match[] = [];
  const unmatched: UtteranceError[] = [];
  // Two errors can quote the same words ("a pronunciation and a grammar note on the
  // same verb"); the second one then has to find its own occurrence, or go unmatched,
  // rather than drawing a second box over the first.
  const taken: Array<[number, number]> = [];

  for (const error of errors) {
    const quote = error.quote?.trim();
    if (!quote) {
      unmatched.push(error);
      continue;
    }
    const needle = fold(quote);
    let from = 0;
    let placed = false;
    for (;;) {
      const start = foldedTranscript.indexOf(needle, from);
      if (start === -1) break;
      const end = start + needle.length;
      const overlaps = taken.some(([s, e]) => start < e && end > s);
      if (!overlaps) {
        matches.push({ start, end, error });
        taken.push([start, end]);
        placed = true;
        break;
      }
      from = start + 1;
    }
    if (!placed) unmatched.push(error);
  }

  matches.sort((a, b) => a.start - b.start);

  const segments: TranscriptSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) segments.push({ text: transcript.slice(cursor, match.start) });
    segments.push({ text: transcript.slice(match.start, match.end), error: match.error });
    cursor = match.end;
  }
  if (cursor < transcript.length) segments.push({ text: transcript.slice(cursor) });

  return { segments, unmatched };
}

/**
 * Whether the corrected sentence is worth showing next to the original. A model that
 * returns the transcript back unchanged (or changed only in spacing/case/accents)
 * would otherwise render as a "correction" that corrects nothing, which teaches the
 * learner to ignore the line.
 */
export function correctionIsMeaningful(transcript: string, corrected: string): boolean {
  if (!corrected?.trim()) return false;
  const normalize = (value: string) =>
    fold(value)
      .replace(/[.,!?¡¿;:'"]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  return normalize(transcript) !== normalize(corrected);
}
