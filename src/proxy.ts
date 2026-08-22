import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

// Next.js 16 renamed `middleware.ts`/`middleware()` to `proxy.ts`/`proxy()` — same
// mechanism, new name. Do not reintroduce `middleware.ts`; see PLAN.md §5.
//
// This does the FULL auth check (not just optimistic cookie presence) because we use
// database sessions (PLAN.md §5) and Proxy defaults to the Node.js runtime in Next 16, so a
// Neon HTTP-driver query here is cheap and safe. Every route handler still re-verifies the
// session independently — Proxy is defense in depth, never the only check (Next's own
// authentication guide is explicit about this).
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isPublicRoute = pathname === '/';
  const isOnboardingRoute = pathname.startsWith('/onboarding');
  const isAdminRoute = pathname.startsWith('/admin');
  const isApiRoute = pathname.startsWith('/api');
  const isAppRoute = !isPublicRoute && !pathname.startsWith('/api/auth');

  // API calls must never get a page redirect: fetch follows a 307 into a GET-only page
  // route (405) and the caller sees a garbled failure instead of JSON. Worse, the
  // onboarding redirect below would intercept the very PATCH /api/me that SETS the
  // missing languagePairId, dead-ending onboarding. JSON 401 for anonymous callers;
  // beyond that, every route handler does its own auth/role/onboarding checks.
  if (isApiRoute) {
    if (!session?.user) {
      return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!session?.user) {
    if (isAppRoute) {
      return NextResponse.redirect(new URL('/', req.nextUrl));
    }
    return NextResponse.next();
  }

  if (isAdminRoute && session.user.role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
  }

  if (isAppRoute && !isOnboardingRoute && !session.user.languagePairId) {
    return NextResponse.redirect(new URL('/onboarding', req.nextUrl));
  }

  return NextResponse.next();
});

// PWA assets are excluded (PLAN.md §7.1). `offline` and `sw.js` matter in particular:
// the service worker fetches `/offline` from the network at install time to precache it,
// and if Proxy answered that request with an auth redirect the precached "offline page"
// would be a redirect to `/` — i.e. airplane mode would show a blank page instead of the
// fallback. None of these paths expose user data.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline|api/auth).*)',
  ],
};
