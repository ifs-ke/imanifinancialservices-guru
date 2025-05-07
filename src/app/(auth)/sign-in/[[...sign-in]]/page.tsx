
// import { SignIn } from '@clerk/nextjs'; // Clerk disabled
import { redirect } from 'next/navigation';

export default function SignInPage() {
  // When Clerk is disabled, redirect to dashboard or a landing page
  redirect('/dashboard');

  // return ( // Clerk disabled
  //   <div className="flex justify-center items-center w-full h-screen">
  //     <SignIn path="/sign-in" />
  //   </div>
  // );
}
