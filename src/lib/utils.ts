import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
