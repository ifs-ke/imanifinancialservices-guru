
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default function Home() {
  const { userId } = auth();

  if (userId) {
    // User is logged in, redirect to dashboard
    redirect('/dashboard');
  } else {
    // User is not logged in, redirect to sign-in
    redirect('/sign-in');
  }
}
