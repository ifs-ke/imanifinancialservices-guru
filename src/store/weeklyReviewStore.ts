
// src/store/weeklyReviewStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Define the structure for a weekly review entry
interface WeeklyReviewData {
  journal: string;
  // transactionNotes?: Record<string, string>; // Future: Notes per transaction ID
}

// Define the state shape. The key will be 'YYYY-WW' (e.g., '2024-30')
interface WeeklyReviewState {
  reviews: Record<string, WeeklyReviewData>;
  setJournalEntry: (weekKey: string, journal: string) => void;
  // Future: add action for transaction notes
  // setTransactionNote: (weekKey: string, transactionId: string, note: string) => void;
  getReviewForWeek: (weekKey: string) => WeeklyReviewData | undefined;
}

export const useWeeklyReviewStore = create<WeeklyReviewState>()(
  persist(
    (set, get) => ({
      reviews: {}, // Initialize with an empty object

      // Action to save or update the journal entry for a specific week
      setJournalEntry: (weekKey, journal) => {
        set((state) => ({
          reviews: {
            ...state.reviews,
            [weekKey]: {
              ...(state.reviews[weekKey] || {}), // Preserve existing notes if any
              journal: journal,
            },
          },
        }));
      },

      // Selector function to get the review data for a specific week
      getReviewForWeek: (weekKey) => {
          return get().reviews[weekKey];
      },

      // Future: Implement transaction note saving
      // setTransactionNote: (weekKey, transactionId, note) => { ... }

    }),
    {
      name: 'ifcGuru_weeklyReviews', // Unique name for local storage
      storage: createJSONStorage(() => localStorage),
      // No special serialization needed for this structure yet
    }
  )
);

// Helper function to generate the week key (YYYY-WW)
export const getWeekKey = (date: Date): string => {
  const year = date.getFullYear();
  // Get ISO week number (handling edge cases might require date-fns getISOWeek)
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const weekNumber = Math.ceil(dayOfYear / 7);
  return `${year}-${weekNumber.toString().padStart(2, '0')}`;
};
