import { t, type Locale } from '@/lib/i18n';
import type { LearnerCostSummary } from '@/lib/costMeter';

// ROADMAP.md P2.11: family cost-awareness, not billing — the numbers are the same
// `usage_log` rows and the same `estimateMonthlyUsd` arithmetic the owner sees on the
// admin usage panel (src/lib/adminLearners.ts), just scoped to this one learner.
export function CostMeterCard({ summary, locale }: { summary: LearnerCostSummary; locale: Locale }) {
  const strings = t(locale).settings;
  const minutes = Math.round(summary.speakingSecondsThisMonth / 60);

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="heading-section">{strings.costMeterTitle}</h2>
      <p className="text-sm text-ink-muted">{strings.costMeterHint}</p>
      <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-3">
        <dt className="text-ink-muted">{strings.costMeterAttempts}</dt>
        <dd className="col-span-1 font-semibold text-ink sm:col-span-2">
          {summary.attemptsThisMonth.toLocaleString(locale)}
        </dd>
        <dt className="text-ink-muted">{strings.costMeterTtsChars}</dt>
        <dd className="col-span-1 font-semibold text-ink sm:col-span-2">
          {summary.ttsCharsThisMonth.toLocaleString(locale)}
        </dd>
        <dt className="text-ink-muted">{strings.costMeterSpeakingMinutes}</dt>
        <dd className="col-span-1 font-semibold text-ink sm:col-span-2">
          {minutes.toLocaleString(locale)}
        </dd>
      </dl>
      <p className="text-lg font-bold text-ink">
        {strings.costMeterEstimate(summary.estimatedMonthlyUsd)}
      </p>
      <p className="text-xs text-ink-muted">{strings.costMeterFootnote}</p>
    </section>
  );
}
