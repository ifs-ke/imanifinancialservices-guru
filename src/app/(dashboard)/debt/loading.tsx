// src/app/(dashboard)/debt/loading.tsx
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function Loading() {
  return (
      <div className="flex h-full w-full items-center justify-center">
        <LoadingSpinner className='left-30' size={48} text="Loading Debts..." />
      </div>
    );
}
