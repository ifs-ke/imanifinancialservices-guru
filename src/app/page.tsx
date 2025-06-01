
 import { redirect } from 'next/navigation';

 // Making the component async as a precaution, though the specific error
 // "used ...headers() or similar iteration" usually points to synchronous iteration
 // of the Headers object, which isn't happening directly in this component's code.
 // The redirect() itself is a dynamic function.
 export default async function Home() {
   const mockUserId = process.env.NEXT_PUBLIC_MOCK_USER_ID;

   if (mockUserId) {
     redirect('/dashboard');
   } else {
     // When Clerk is disabled, and no mock user, always redirect to dashboard
     // as sign-in flow is also disabled.
     redirect('/dashboard');
   }
 }
