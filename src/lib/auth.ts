import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from './db';
import { eq } from 'drizzle-orm';
import { accounts, sessions, users, verificationTokens } from './db/schema';
import { isAllowedToSignIn, isOwnerEmail } from './owner';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [Google],
  session: { strategy: 'database' },
  pages: {
    signIn: '/',
  },
  callbacks: {
    /**
     * The invite gate (ROADMAP.md P1.5b follow-on item 7). With INVITED_EMAILS unset
     * this returns true for everyone, exactly as before; with it set, the people who
     * may sign in are a decision the owner made rather than "whoever found the URL".
     */
    async signIn({ user }) {
      const email = user.email?.trim().toLowerCase();
      const alreadyKnown = email
        ? (await db.select({ id: users.id }).from(users).where(eq(users.email, email))).length > 0
        : false;
      return isAllowedToSignIn({ email, alreadyKnown });
    },
    async session({ session, user }) {
      session.user.id = user.id;
      // OWNER_EMAILS wins over the row. The role column can be lost to a bad UPDATE or
      // a restore from an older dump; the environment variable is what makes locking
      // yourself out of your own admin page impossible.
      session.user.role = isOwnerEmail(user.email) ? 'admin' : user.role;
      session.user.languagePairId = user.languagePairId;
      session.user.level = user.level;
      session.user.coachingProfile = user.coachingProfile;
      session.user.focusSkills = user.focusSkills;
      session.user.timezone = user.timezone;
      session.user.handsFreeTurnTaking = user.handsFreeTurnTaking;
      // PLAN.md §15.3: read here so the capability check is one field lookup on a
      // session the route already has. It is never sent to the browser as a feature
      // flag - the gate is the server check, not this value.
      session.user.tier = user.tier;
      // What the tutor knows about them, and how they want to be explained to
      // (ROADMAP.md P1.5b follow-on item 6). Read on every graded turn, so it rides
      // the session rather than costing the attempt route another query.
      session.user.profileNotes = user.profileNotes;
      session.user.factLearning = user.factLearning;
      session.user.explanationLanguage = user.explanationLanguage;
      return session;
    },
  },
});
