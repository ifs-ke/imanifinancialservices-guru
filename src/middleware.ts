
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define routes that should be protected
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)', // Protect dashboard and all its sub-routes
  '/transactions(.*)',
  '/income-expenses(.*)',
  '/debt(.*)',
  '/statements(.*)',
  '/budget(.*)',
  '/weekly-review(.*)', // Protect the new weekly review route
]);

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) {
    auth().protect(); // Protect the route if it matches
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    // Match all routes including api/trpc routes (Clerk needs to run on these)
    '/(api|trpc)(.*)',
  ],
};
