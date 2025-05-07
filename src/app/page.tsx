
// import { auth } from '@clerk/nextjs/server'; // Clerk disabled
import { redirect } from 'next/navigation';

export default function Home() {
  // const { userId } = auth(); // Clerk disabled

  // When Clerk is disabled, always redirect to the dashboard
  redirect('/dashboard');

  // if (userId) { // Clerk disabled
  //   // User is logged in, redirect to dashboard
  //   redirect('/dashboard');
  // } else {
  //   // User is not logged in, redirect to sign-in
  //   redirect('/sign-in');
  // }
}