// src/app/page.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect('/dashboard');
  } else {
    redirect('/sign-in');
  }
}
