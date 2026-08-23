/**
 * Who owns this install, and who is allowed in (ROADMAP.md P1.5b follow-on item 7).
 *
 * Both lists live in environment variables rather than in the database, deliberately:
 * the whole point of the owner list is that admin access survives whatever happens to
 * a `users.role` row - a bad UPDATE, a restore from an older dump, a seed script run
 * against the wrong database. A value you cannot lose by editing a table is the only
 * kind that can be the backstop for editing tables.
 */

function parseEmailList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/** Emails that are admins no matter what their row says. */
export function ownerEmails(): string[] {
  return parseEmailList(process.env.OWNER_EMAILS);
}

/**
 * Emails allowed to sign in, when the list is in use. Owners are always on it - an
 * owner who typo'd themselves out of their own invite list has locked themselves out
 * of the only screen that would show them the mistake.
 */
export function invitedEmails(): string[] {
  const invited = parseEmailList(process.env.INVITED_EMAILS);
  if (invited.length === 0) return [];
  return Array.from(new Set([...invited, ...ownerEmails()]));
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEmails().includes(email.trim().toLowerCase());
}

/**
 * Whether this email may sign in.
 *
 * An EMPTY invite list means "anyone with a Google account", which is what the app has
 * done since Phase 2 - setting the variable is what turns the gate on, so deploying
 * this change alone locks nobody out.
 *
 * `alreadyKnown` is true for an email that already has a user row. Existing learners
 * keep their access even when they are not on the list: the failure mode of a typo in
 * an environment variable must not be a family member losing their streak. /admin shows
 * exactly who is in that position, so it stays visible rather than silent.
 */
export function isAllowedToSignIn(args: {
  email: string | null | undefined;
  alreadyKnown: boolean;
}): boolean {
  const list = invitedEmails();
  if (list.length === 0) return true;
  if (args.alreadyKnown) return true;
  if (!args.email) return false;
  return list.includes(args.email.trim().toLowerCase());
}

export type InviteStatus = 'joined' | 'invited_not_joined' | 'joined_without_invite';

export type InviteRow = {
  email: string;
  status: InviteStatus;
  name: string | null;
  isOwner: boolean;
};

/** The invite list as /admin shows it: who was invited, who turned up, who slipped in. */
export function buildInviteRows(args: {
  invited: string[];
  owners: string[];
  users: { email: string; name: string | null }[];
}): InviteRow[] {
  const byEmail = new Map(args.users.map((u) => [u.email.trim().toLowerCase(), u]));
  const owners = new Set(args.owners.map((e) => e.toLowerCase()));
  const invited = args.invited.map((e) => e.toLowerCase());

  const rows: InviteRow[] = invited.map((email) => ({
    email,
    status: byEmail.has(email) ? 'joined' : 'invited_not_joined',
    name: byEmail.get(email)?.name ?? null,
    isOwner: owners.has(email),
  }));

  // Anyone with an account who is not on the list - either they signed in before the
  // list existed, or the list was changed under them. Either way the owner should see
  // it, because it is the one case where the gate is not actually gating.
  for (const [email, user] of byEmail) {
    if (invited.includes(email)) continue;
    rows.push({
      email,
      status: 'joined_without_invite',
      name: user.name,
      isOwner: owners.has(email),
    });
  }

  return rows.sort((a, b) => a.email.localeCompare(b.email));
}
