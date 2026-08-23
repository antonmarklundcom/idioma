import type { AdminLearnerCard } from '@/lib/adminLearners';
import type { InviteRow } from '@/lib/owner';

const STATUS_LABEL: Record<InviteRow['status'], string> = {
  joined: 'signed in',
  invited_not_joined: 'invited, not signed in yet',
  joined_without_invite: 'has an account, not on the list',
};

const STATUS_STYLE: Record<InviteRow['status'], string> = {
  joined: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  invited_not_joined: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  joined_without_invite: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

function trend(now: number | null, before: number | null): string {
  if (now === null) return '—';
  if (before === null || before === 0) return now.toFixed(1);
  const change = Math.round(((before - now) / before) * 100);
  if (change === 0) return `${now.toFixed(1)} (flat)`;
  return `${now.toFixed(1)} (${change > 0 ? '↓' : '↑'}${Math.abs(change)}%)`;
}

/**
 * Who exists, who was invited, and what each person is doing (ROADMAP.md P1.5b
 * follow-on item 7). Read-only: promoting, inviting and removing are all environment
 * variables or SQL, on purpose - this screen is for seeing, not for one wrong tap.
 */
export function PeoplePanel({
  learners,
  invites,
  inviteListActive,
}: {
  learners: AdminLearnerCard[];
  invites: InviteRow[];
  inviteListActive: boolean;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">People</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {inviteListActive
            ? 'INVITED_EMAILS is set: only these addresses can sign in for the first time. Anyone who already has an account keeps it.'
            : 'INVITED_EMAILS is not set, so anyone with a Google account can sign in. Set it to close that.'}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
        <p className="text-xs text-slate-400">Invite list</p>
        {invites.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Nobody yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {invites.map((row) => (
              <li
                key={row.email}
                className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700 dark:text-slate-300"
              >
                <span className="truncate">
                  {row.name ? `${row.name} · ${row.email}` : row.email}
                  {row.isOwner && (
                    <span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-white dark:text-slate-900">
                      owner
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[row.status]}`}
                >
                  {STATUS_LABEL[row.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {learners.map((learner) => (
          <div
            key={learner.userId}
            className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-slate-900 dark:text-white">
                {learner.name ?? learner.email}
              </p>
              <p className="text-xs text-slate-400">
                {learner.level ?? 'no level'} · {learner.email}
              </p>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-400">Streak</dt>
                <dd className="text-slate-700 dark:text-slate-300">
                  🔥 {learner.currentStreak} (best {learner.longestStreak})
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Lessons done</dt>
                <dd className="text-slate-700 dark:text-slate-300">{learner.lessonsCompleted}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Mistakes/turn</dt>
                <dd className="text-slate-700 dark:text-slate-300">
                  {trend(learner.mistakesPerTurnThisWeek, learner.mistakesPerTurnLastWeek)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">This month</dt>
                {/* An estimate, and labelled as one: only the TTS half is actually
                    billed today - see the rates in lib/adminLearners.ts. */}
                <dd className="text-slate-700 dark:text-slate-300">
                  ~${learner.estimatedMonthlyUsd.toFixed(2)} · {learner.attemptsThisMonth} turns
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
