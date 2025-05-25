
// src/app/api/save/route.ts
import { NextResponse } from 'next/server';
import { addCorsHeaders } from '@/lib/utils'; 
import { logError, logWarn } from '@/lib/logger'; 

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  addCorsHeaders(response);
  return response;
}

export async function POST(request: Request) {
  const { userId: clerkUserId } = { userId: process.env.NEXT_PUBLIC_MOCK_USER_ID }; // Using mock user ID
  const logContextBase = { userId: clerkUserId || 'unknown-save-post', operation: 'POST /api/save', apiRoute: '/api/save' };

  logWarn('Save API: MongoDB has been removed. Save operation is disabled.', logContextBase, clerkUserId);
  
  const response = NextResponse.json({ 
    error: 'Database functionality has been removed. Cannot save data.',
    message: 'Data persistence to MongoDB is disabled.' 
  }, { status: 503 }); // Service Unavailable
  
  return addCorsHeaders(response);
}
