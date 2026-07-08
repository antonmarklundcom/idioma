import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  if (!session) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (pathname.startsWith('/admin') && session.user.role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  if (!session.user.languagePairId && pathname !== '/onboarding') {
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/dashboard/:path*', '/lesson/:path*', '/live/:path*', '/settings/:path*', '/onboarding', '/admin/:path*'],
};
