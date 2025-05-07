
// import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'; // Clerk disabled

// Define routes that should be protected
// Security: This list defines which parts of the application require authentication.
// Ensure all routes containing sensitive user data are included here.
// const isProtectedRoute = createRouteMatcher([ // Clerk disabled
//   '/dashboard(.*)', // Protect dashboard and all its sub-routes
//   '/transactions(.*)',
//   '/income-expenses(.*)',
//   '/debt(.*)',
//   '/statements(.*)',
//   '/budget(.*)',
//   '/weekly-review(.*)',
//   '/logger(.*)',
//   '/api/(save|sync)(.*)', // Protect the data sync/save API endpoints
// ]);

// export default clerkMiddleware((auth, req) => { // Clerk disabled
//   // Security: If the requested route matches the protected patterns...
//   if (isProtectedRoute(req)) {
//     auth().protect(); // ...require the user to be authenticated via Clerk.
//   }
// });

// When Clerk is disabled, we don't need a middleware for auth.
// If other middleware logic is needed, it can be added here.
// For now, an empty middleware or removing it entirely is fine.
import type { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // console.log('Middleware called, Clerk is disabled. Path:', request.nextUrl.pathname);
  // No-op when Clerk is disabled, or add other middleware logic if needed.
  // return NextResponse.next(); // This line is optional if no other logic
}


export const config = {
  matcher: [
    // Skip Next.js internals and static files (e.g., images, fonts)
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    // Match all routes including api/trpc routes (Clerk middleware needs to run on API routes for auth checks)
    // '/(api|trpc)(.*)', // Clerk disabled, so API routes are not explicitly matched here for Clerk
  ],
};
