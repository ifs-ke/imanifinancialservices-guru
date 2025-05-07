// src/app/(auth)/sign-in/[[...sign-in]]/page.tsx

// import { SignIn } from '@clerk/nextjs'; // Clerk disabled
import { redirect } from 'next/navigation';


export default function SignInPage() {
  // When Clerk is disabled, redirect to dashboard or a landing page
  redirect('/dashboard');

  // return ( // Clerk disabled
  //   <div className="flex items-center justify-center min-h-screen">
  //     <SignIn />
  //   </div>
  // );
}