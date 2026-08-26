import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getUserLocale } from '@/lib/getUserLocale';
import { t } from '@/lib/i18n';

// ROADMAP.md P3.13: a 30-second "how a session works" interstitial between
// onboarding and the first real screen - three simple cards, no asset pipeline
// (emoji as the illustration), then onward to wherever onboarding was sending the
// learner (their placement check, or straight to /today).
const ALLOWED_NEXT = ['/today', '/placement'] as const;
type AllowedNext = (typeof ALLOWED_NEXT)[number];

function isAllowedNext(value: string | undefined): value is AllowedNext {
  return value !== undefined && (ALLOWED_NEXT as readonly string[]).includes(value);
}

export default async function OnboardingWelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = isAllowedNext(next) ? next : '/today';

  const session = await auth();
  const locale = session?.user ? await getUserLocale(session.user.id) : 'en';
  const strings = t(locale).onboardingWelcome;

  const cards = [
    { emoji: '🔥', title: strings.warmupTitle, body: strings.warmupBody },
    { emoji: '📘', title: strings.lessonTitle, body: strings.lessonBody },
    { emoji: '🎤', title: strings.speakTitle, body: strings.speakBody },
  ];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="heading-page text-4xl">{strings.title}</h1>
        <p className="max-w-md text-lg text-ink-muted">{strings.subtitle}</p>
      </div>

      <div className="flex w-full flex-col gap-4">
        {cards.map((card) => (
          <div key={card.title} className="card flex items-center gap-4 p-5">
            <span className="text-4xl" aria-hidden="true">
              {card.emoji}
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-lg font-bold text-ink">{card.title}</span>
              <span className="text-base text-ink-muted">{card.body}</span>
            </div>
          </div>
        ))}
      </div>

      <Link href={destination} className="btn-primary min-h-14 w-full text-lg">
        {strings.continueButton}
      </Link>
    </div>
  );
}
