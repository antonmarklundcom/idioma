import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildInviteRows,
  invitedEmails,
  isAllowedToSignIn,
  isOwnerEmail,
  ownerEmails,
} from '@/lib/owner';

// The gate on the front door, and the backstop on the admin page. The rules that
// matter are the failure modes: an unset variable must change nothing, and a typo
// must not lock an existing learner out.

function withEnv(env: Record<string, string | undefined>, run: () => void) {
  const previous = { OWNER_EMAILS: process.env.OWNER_EMAILS, INVITED_EMAILS: process.env.INVITED_EMAILS };
  // Assigning `undefined` to process.env stores the STRING "undefined", which is
  // exactly the bug these tests exist to catch elsewhere - so unset means delete.
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('ownerEmails / isOwnerEmail', () => {
  it('reads a comma-separated list, case- and space-insensitively', () => {
    withEnv({ OWNER_EMAILS: ' Anton@Example.com , second@example.com ' }, () => {
      assert.deepEqual(ownerEmails(), ['anton@example.com', 'second@example.com']);
      assert.equal(isOwnerEmail('ANTON@example.com'), true);
      assert.equal(isOwnerEmail('someone@example.com'), false);
    });
  });

  it('has no owners when the variable is unset, and never crashes on null', () => {
    withEnv({ OWNER_EMAILS: undefined }, () => {
      assert.deepEqual(ownerEmails(), []);
      assert.equal(isOwnerEmail(null), false);
      assert.equal(isOwnerEmail(undefined), false);
    });
  });
});

describe('isAllowedToSignIn', () => {
  it('lets everyone in when no invite list is set — the behaviour before this existed', () => {
    withEnv({ INVITED_EMAILS: undefined, OWNER_EMAILS: undefined }, () => {
      assert.equal(isAllowedToSignIn({ email: 'anyone@example.com', alreadyKnown: false }), true);
    });
  });

  it('admits an invited address and refuses an uninvited one', () => {
    withEnv({ INVITED_EMAILS: 'mum@example.com', OWNER_EMAILS: undefined }, () => {
      assert.equal(isAllowedToSignIn({ email: 'MUM@example.com', alreadyKnown: false }), true);
      assert.equal(isAllowedToSignIn({ email: 'stranger@example.com', alreadyKnown: false }), false);
    });
  });

  it('always admits an owner, even one left off their own invite list', () => {
    withEnv({ INVITED_EMAILS: 'mum@example.com', OWNER_EMAILS: 'anton@example.com' }, () => {
      assert.equal(isAllowedToSignIn({ email: 'anton@example.com', alreadyKnown: false }), true);
      assert.ok(invitedEmails().includes('anton@example.com'));
    });
  });

  it('never locks out someone who already has an account', () => {
    withEnv({ INVITED_EMAILS: 'mum@example.com', OWNER_EMAILS: undefined }, () => {
      assert.equal(isAllowedToSignIn({ email: 'dad@example.com', alreadyKnown: true }), true);
    });
  });

  it('refuses a missing email once the list is on', () => {
    withEnv({ INVITED_EMAILS: 'mum@example.com', OWNER_EMAILS: undefined }, () => {
      assert.equal(isAllowedToSignIn({ email: null, alreadyKnown: false }), false);
    });
  });
});

describe('buildInviteRows', () => {
  it('separates who turned up from who has not', () => {
    const rows = buildInviteRows({
      invited: ['mum@example.com', 'dad@example.com'],
      owners: [],
      users: [{ email: 'mum@example.com', name: 'Mum' }],
    });
    assert.deepEqual(
      rows.map((r) => [r.email, r.status]),
      [
        ['dad@example.com', 'invited_not_joined'],
        ['mum@example.com', 'joined'],
      ],
    );
  });

  it('surfaces an account that is not on the list rather than hiding it', () => {
    const rows = buildInviteRows({
      invited: ['mum@example.com'],
      owners: ['anton@example.com'],
      users: [
        { email: 'mum@example.com', name: 'Mum' },
        { email: 'anton@example.com', name: 'Anton' },
      ],
    });
    const anton = rows.find((r) => r.email === 'anton@example.com');
    assert.equal(anton?.status, 'joined_without_invite');
    assert.equal(anton?.isOwner, true);
  });

  it('matches an account to its invite regardless of case', () => {
    const rows = buildInviteRows({
      invited: ['Mum@Example.com'],
      owners: [],
      users: [{ email: 'mum@example.com', name: 'Mum' }],
    });
    assert.deepEqual(rows.map((r) => r.status), ['joined']);
  });
});
