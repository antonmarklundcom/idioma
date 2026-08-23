import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from './db';
import { accounts, sessions, users, verificationTokens } from './db/schema';

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
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.role = user.role;
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
