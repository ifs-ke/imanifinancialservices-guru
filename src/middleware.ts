import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'; // Re-enable Clerk
import type { NextRequest, NextResponse } from 'next/server'; // Keep for type safety if needed

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
   '/weekly-review(.*)',
   '/notifications(.*)', // Protect notifications page
   '/logger(.*)', // Protect logger page (if it's meant to be restricted)
   '/api/(save|sync|client-log)(.*)', // Protect the data sync/save API endpoints and client-log
   '/actions/(shareActions)(.*)', // Protect server actions related to sharing
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
     '/(api|trpc|actions)(.*)', // Ensure Clerk runs on API routes and server actions
   ],
 };
