
// import { SignUp } from '@clerk/nextjs'; // Clerk disabled
import { redirect } from 'next/navigation';

export default function SignUpPage() {
  // When Clerk is disabled, redirect to dashboard or a landing page
   redirect('/dashboard');

  // return ( // Clerk disabled
  //   <div className="flex justify-center items-center min-h-screen">
  //     <SignUp path="/sign-up" />
  //   </div>
  // );
}
