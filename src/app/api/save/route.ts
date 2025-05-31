
// src/app/api/save/route.ts
import { NextResponse } from 'next/server';
import { addCorsHeaders } from '@/lib/utils';
import { logWarn } from '@/lib/logger';
// Clerk auth import can remain if other API routes still use it, but this route is now a stub.
// import { auth } from '@clerk/nextjs/server';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  addCorsHeaders(response);
  return response;
}

export async function POST(request: Request) {
  // const { userId } = auth(); // Clerk auth, if needed for logging or other purposes
  const mockUserIdIfNoClerk = process.env.NEXT_PUBLIC_MOCK_USER_ID || 'local-user';
  const logContextBase = { userId: mockUserIdIfNoClerk, operation: 'POST /api/save (DISABLED)', apiRoute: '/api/save' };

  logWarn('Save API: Server-side save operation is disabled. Application is in local-only storage mode.', logContextBase);

  const response = NextResponse.json({
    message: 'Server-side saving is disabled. Data is stored locally in the browser.',
    status: 'local_only_mode'
  }, { status: 200 }); // Return 200 OK but indicate local storage

  return addCorsHeaders(response);
}
