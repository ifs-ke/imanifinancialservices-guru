
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
  '/api/(.*)',      // Protect API routes
  '/actions/(.*)'  // Protect server actions
]);

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) {
    auth().protect();
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
