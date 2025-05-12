
// import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'; // Clerk disabled
import type { NextRequest, NextResponse } from 'next/server';

// Define routes that *would* be protected if Clerk were active
// This is kept for reference or if Clerk is re-enabled
const isProtectedRoute = (pathname: string) => {
  const protectedPaths = [
    '/dashboard',
    '/transactions',
    '/income-expenses',
    '/debt',
    '/statements',
    '/budget',
    '/weekly-review',
    '/notifications',
    '/logger',
    '/api/save',
    '/api/sync',
    '/api/client-log',
    '/actions/shareActions',
  ];
  return protectedPaths.some(path => pathname.startsWith(path));
};


export function middleware(req: NextRequest): NextResponse | undefined {
  // When Clerk is disabled, middleware does not perform any auth checks.
  // All routes become public from middleware's perspective.
  // Actual access control would need to be handled by page/API logic
  // based on NEXT_PUBLIC_MOCK_USER_ID if needed.
  
  // console.log(`Middleware invoked for path: ${req.nextUrl.pathname}. Clerk is disabled.`);

  // To make it a no-op, just return without modifying the request or response.
  // Or, if you need to explicitly pass through:
  // import { NextResponse } from 'next/server';
  // return NextResponse.next();
  return undefined;
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    // Match all routes including api/trpc routes
    '/(api|trpc|actions)(.*)',
  ],
};
