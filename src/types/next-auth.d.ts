import type { DefaultSession } from 'next-auth';

type Role = 'learner' | 'admin';
type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
      languagePairId: string | null;
      level: CefrLevel | null;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/adapters' {
  interface AdapterUser {
    role: Role;
    languagePairId: string | null;
    level: CefrLevel | null;
  }
}
