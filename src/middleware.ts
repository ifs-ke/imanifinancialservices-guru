
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define routes that should be protected
// Security: This list defines which parts of the application require authentication.
// Ensure all routes containing sensitive user data are included here.
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)', // Protect dashboard and all its sub-routes
  '/transactions(.*)',
  '/income-expenses(.*)',
  '/debt(.*)',
  '/statements(.*)',
  '/budget(.*)',
  '/weekly-review(.*)', // Protect the new weekly review route
  '/logger(.*)', // Protect the new logger route
  '/api/(save|sync)(.*)', // Protect the data sync/save API endpoints
]);

export default clerkMiddleware((auth, req) => {
  // Security: If the requested route matches the protected patterns...
  if (isProtectedRoute(req)) {
    auth().protect(); // ...require the user to be authenticated via Clerk.
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files (e.g., images, fonts)
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    // Match all routes including api/trpc routes (Clerk middleware needs to run on API routes for auth checks)
    '/(api|trpc)(.*)',
  ],
};

    
