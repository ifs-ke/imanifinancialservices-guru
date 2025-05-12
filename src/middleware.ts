import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define routes that should be protected
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/transactions(.*)',
  '/income-expenses(.*)',
  '/debt(.*)',
  '/statements(.*)',
  '/budget(.*)',
  '/weekly-review(.*)',
  '/notifications(.*)',
  '/logger(.*)',
  '/api/(save|sync|client-log)(.*)', // Ensure API routes requiring auth are matched
  '/actions/(shareActions)(.*)', // Ensure server actions requiring auth are matched
]);

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) {
    auth().protect(); // Protect routes defined in isProtectedRoute
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    // Match all routes including api/trpc routes
    '/(api|trpc|actions)(.*)',
  ],
};
