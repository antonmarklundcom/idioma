import { DrizzleAdapter } from '@auth/drizzle-adapter';
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { db } from '@/lib/db';
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'database' },
  providers: [Google],
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.role = user.role;
      session.user.languagePairId = user.languagePairId;
      session.user.level = user.level;
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
});
