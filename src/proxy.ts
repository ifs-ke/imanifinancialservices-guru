// src/proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths: home (/), privacy, terms, sign-in, sign-up, api routes, static assets
  const publicPaths = ['/', '/privacy', '/terms', '/sign-in', '/sign-up'];
  
  if (
    publicPaths.includes(pathname) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check for authentication cookies (__session or uid)
  const sessionCookie = request.cookies.get('__session')?.value;
  const uidCookie = request.cookies.get('uid')?.value;
  const isAuthenticated = !!(sessionCookie || uidCookie);

  if (!isAuthenticated) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

// Support both proxy and middleware convention for Next.js 16
export function middleware(request: NextRequest) {
  return proxy(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
