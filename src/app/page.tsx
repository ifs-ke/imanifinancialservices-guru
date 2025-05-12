
 import { redirect } from 'next/navigation';

 export default function Home() {
   // const { userId } = auth(); // Clerk disabled

   // When Clerk is disabled, use environment variable to determine if "logged in"
   const mockUserId = process.env.NEXT_PUBLIC_MOCK_USER_ID;

   if (mockUserId) {
     // User is "logged in" via mock ID, redirect to dashboard
     redirect('/dashboard');
   } else {
     // No mock user ID, consider "logged out", redirect to a generic landing or info page
     // As sign-in is disabled, redirecting to /sign-in might not be useful.
     // Consider creating a simple landing page or redirecting to dashboard anyway
     // depending on desired behavior without Clerk.
     // For now, let's assume if no mock ID, they are not "logged in" for app's purpose.
     // If you have a public landing page, redirect there. Otherwise, to dashboard.
     redirect('/dashboard'); // Or a public landing page if you have one.
   }
 }
