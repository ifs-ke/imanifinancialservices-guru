 import { auth } from '@clerk/nextjs/server'; // Use Clerk's server-side auth
 import { redirect } from 'next/navigation';

 export default function Home() {
   const { userId } = auth(); // Get userId from Clerk

   // Redirect logic based on actual Clerk auth state
   if (userId) {
     // User is logged in, redirect to dashboard
     redirect('/dashboard');
   } else {
     // User is not logged in, redirect to sign-in
     redirect('/sign-in');
   }
 }
