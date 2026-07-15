import type { CoachingProfile } from '@/lib/db/schema';

// Coaching profiles are app behavior shared by every language pair (PLAN.md §11.3),
// not pair-specific data - they live here as named constants, not in language_pairs.
const COACHING_PROFILE_TEXT: Record<CoachingProfile, string> = {
  confidence_first:
    "This learner chose the 'confidence to speak' coaching style. Open tutorReply by " +
    'naming specifically what they communicated successfully. Explicitly correct only the ' +
    '1-2 highest-severity errors this turn; fold every other real error into your reply as ' +
    'a natural recast (model the correct form without flagging it as a correction). Never ' +
    're-correct the same minor slip twice in one session. Keep followUpQuestion inviting and ' +
    'easily answerable at their level. The errors array must still report every real error ' +
    'you found, even ones you only recast in the reply.',
  accuracy_focus:
    "This learner chose the 'correct everything and explain why' coaching style. Report " +
    'every real error explicitly in the errors array with a one-line metalinguistic ' +
    'explanation of the rule, not just the fixed form. Craft followUpQuestion to elicit the ' +
    'corrected structure again in their next turn. Still react to the content of what they ' +
    "said - don't ignore meaning in favor of grammar.",
};

const DEFAULT_COACHING_PROFILE: CoachingProfile = 'confidence_first';

type LanguagePairPromptFields = {
  tutorPromptTemplate: string;
  conversationPromptTemplate: string | null;
  dialectNotes: string | null;
  correctionStyle: string | null;
  errorTaxonomy: string[];
};

type RecurringErrorSummary = {
  category: string;
  description: string;
};

export function assembleSystemPrompt(args: {
  pair: LanguagePairPromptFields;
  mode: 'lesson' | 'live';
  level: string;
  coachingProfile: CoachingProfile | null;
  recurringErrors: RecurringErrorSummary[];
  lessonContext: string;
}): string {
  const template =
    args.mode === 'live' && args.pair.conversationPromptTemplate
      ? args.pair.conversationPromptTemplate
      : args.pair.tutorPromptTemplate;

  const recurringErrorsText = args.recurringErrors.length
    ? args.recurringErrors.map((e) => `- (${e.category}) ${e.description}`).join('\n')
    : "None recorded yet - this learner is just getting started, don't invent any.";

  return template
    .replaceAll('{{level}}', args.level)
    .replaceAll('{{dialect_notes}}', args.pair.dialectNotes ?? 'None.')
    .replaceAll('{{correction_style}}', args.pair.correctionStyle ?? 'Encouraging and concise.')
    .replaceAll(
      '{{coaching_profile}}',
      COACHING_PROFILE_TEXT[args.coachingProfile ?? DEFAULT_COACHING_PROFILE],
    )
    .replaceAll('{{recurring_errors}}', recurringErrorsText)
    .replaceAll('{{lesson_context}}', args.lessonContext)
    .replaceAll('{{error_taxonomy}}', args.pair.errorTaxonomy.join(', '));
}

export const FREE_PRACTICE_LESSON_CONTEXT =
  'Free conversation practice - no fixed exercise. Invite the learner to talk about ' +
  'anything comfortable for their level, then follow their lead.';
