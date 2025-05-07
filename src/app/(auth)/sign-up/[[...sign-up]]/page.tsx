// src/app/(auth)/sign-up/[[...sign-up]]/page.tsx

 // import { SignUp } from '@clerk/nextjs'; // Clerk disabled
 import { redirect } from 'next/navigation';


 export default function SignUpPage() {
   // When Clerk is disabled, redirect to dashboard or a landing page
     redirect('/dashboard');

   // return ( // Clerk disabled
   //   <div className="flex items-center justify-center min-h-screen">
   //     <SignUp />
   //   </div>
   // );
 }
