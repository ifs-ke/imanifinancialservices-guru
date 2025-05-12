import type { NextRequest, NextResponse } from 'next/server';
// import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'; // Clerk disabled

// Define routes that could be protected
// Security: This list defines which parts of the application might require authentication.
// Ensure all routes containing sensitive user data are included here if re-enabling auth.
// const isProtectedRoute = createRouteMatcher([
//   '/dashboard(.*)',
//   '/transactions(.*)',
//   '/income-expenses(.*)',
//   '/debt(.*)',
//   '/statements(.*)',
//   '/budget(.*)',
//   '/weekly-review(.*)',
//   '/notifications(.*)',
//   '/logger(.*)',
//   '/api/(save|sync|client-log)(.*)',
//   '/actions/(shareActions)(.*)',
// ]);

// When Clerk is disabled, this middleware can be simplified or removed if not handling other logic.
// For now, it will just pass through requests.
export function middleware(req: NextRequest) {
  // console.log('Middleware running for path:', req.nextUrl.pathname); // For debugging if needed

  // If Clerk were enabled, auth logic would be here:
  // if (isProtectedRoute(req)) {
  //   auth().protect();
  // }

  // Pass through the request if Clerk is disabled or for public routes
  return; // NextResponse.next() is implicit if nothing is returned
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    // Match all routes including api/trpc routes (if Clerk were enabled, it would need to run here)
    '/(api|trpc|actions)(.*)',
  ],
};
