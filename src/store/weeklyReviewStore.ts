// src/store/weeklyReviewStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Define the structure for a weekly review entry
export interface WeeklyReviewData { // Export for use in API route
  journal: string;
  transactionComments?: Record<string, string>; // transactionId -> comment string
}

// Define the state shape. The key will be 'YYYY-WW' (e.g., '2024-30')
interface WeeklyReviewState {
  reviews: Record<string, WeeklyReviewData>;
  setReviews: (reviews: Record<string, WeeklyReviewData>) => void; // Action to overwrite state
  setJournalEntry: (weekKey: string, journal: string) => void;
  // New actions for transaction comments
  setTransactionComment: (weekKey: string, transactionId: string, comment: string) => void;
  deleteTransactionComment: (weekKey: string, transactionId: string) => void;
  getReviewForWeek: (weekKey: string) => WeeklyReviewData | undefined;
  getTransactionComment: (weekKey: string, transactionId: string) => string | undefined;
}

export const useWeeklyReviewStore = create<WeeklyReviewState>()(
  persist(
    (set, get) => ({
      reviews: {}, // Initialize with an empty object

      // Action to replace the entire reviews object
      setReviews: (reviews) => set({ reviews: reviews || {} }), // Add default empty object

      // Action to save or update the journal entry for a specific week
      setJournalEntry: (weekKey, journal) => {
        set((state) => {
             const currentReview = state.reviews[weekKey] || { journal: '', transactionComments: {} };
             return {
                 reviews: {
                     ...state.reviews,
                     [weekKey]: {
                         ...currentReview,
                         journal: journal,
                     },
                 },
             };
        });
      },

       // Action to save or update a comment for a specific transaction within a week
       setTransactionComment: (weekKey, transactionId, comment) => {
         set((state) => {
            const currentReview = state.reviews[weekKey] || { journal: '', transactionComments: {} };
             const newComments = { ...(currentReview.transactionComments || {}), [transactionId]: comment };
             // Remove comment if empty string is passed
             if (comment.trim() === '') {
                delete newComments[transactionId];
             }
             return {
                 reviews: {
                    ...state.reviews,
                    [weekKey]: {
                         ...currentReview,
                         transactionComments: newComments,
                    },
                 },
             };
         });
       },

      // Action to delete a comment for a specific transaction within a week
      deleteTransactionComment: (weekKey, transactionId) => {
         set((state) => {
             const currentReview = state.reviews[weekKey];
             if (!currentReview || !currentReview.transactionComments) return state; // No review or comments to delete from

             const newComments = { ...currentReview.transactionComments };
             delete newComments[transactionId]; // Remove the comment

             return {
                 reviews: {
                     ...state.reviews,
                     [weekKey]: {
                         ...currentReview,
                         transactionComments: newComments,
                     },
                 },
             };
         });
      },


      // Selector function to get the review data for a specific week
      getReviewForWeek: (weekKey) => {
          return get().reviews[weekKey];
      },

      // Selector function to get a specific transaction comment for a week
      getTransactionComment: (weekKey, transactionId) => {
          return get().reviews[weekKey]?.transactionComments?.[transactionId];
      },

    }),
    {
      name: 'ifcGuru_weeklyReviews', // Unique name for local storage
      storage: createJSONStorage(() => localStorage),
      // No special serialization needed for this structure yet
       // Deserialize: Ensure reviews is at least an empty object
       deserialize: (str) => {
         const state = JSON.parse(str);
         state.state.reviews = state.state.reviews || {};
         return state;
       },
    }
  )
);

// Helper function to generate the week key (YYYY-WW) - using date-fns for robustness
import { getISOWeek, getYear } from 'date-fns';

export const getWeekKey = (date: Date): string => {
  const year = getYear(date);
  const weekNumber = getISOWeek(date); // Use ISO week number
  return `${year}-${weekNumber.toString().padStart(2, '0')}`;
};

