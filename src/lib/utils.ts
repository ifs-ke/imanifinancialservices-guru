import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { NextResponse } from 'next/server';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formatting Function - Moved here
export const formatCurrency = (amount: number | undefined) => {
   if (amount === undefined || isNaN(amount)) return 'N/A';
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES', // Use KES
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

/**
 * Adds standard CORS headers to a NextResponse object.
 * Adjust origin and methods as needed for your specific security requirements.
 *
 * @param response The NextResponse object to modify.
 * @returns The NextResponse object with added CORS headers.
 */
export function addCorsHeaders(response: NextResponse): NextResponse {
  // Allow requests from any origin in development, restrict in production
  // IMPORTANT: For production, replace '*' with your specific frontend domain(s)
  const origin = process.env.NODE_ENV === 'development'
    ? '*'
    : 'YOUR_FRONTEND_DOMAIN'; // Replace with your actual frontend domain

  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'true'); // If you need cookies/auth headers

  return response;
}
