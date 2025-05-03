// src/store/weeklyReviewStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { encode, decode } from '@/lib/storage-utils'; // Import encoding/decoding utils
import { getISOWeek, getYear } from 'date-fns'; // Import date-fns helpers

// Define the structure for a weekly review entry
export interface WeeklyReviewData { // Export for use in API route
  journal: string;
  transactionComments?: Record<string, string>; // transactionId -> comment string
}

// Custom Session Storage with Base64 encoding
const createSessionStorageWithEncoding = (): StateStorage => {
  const storage = sessionStorage; // Use sessionStorage
  return {
    getItem: (name) => {
      const str = storage.getItem(name);
      if (!str) return null;
      try {
        const decodedStr = decode(str); // Decode Base64
        return decodedStr;
      } catch (e) {
        console.error(`Failed to decode item "${name}" from sessionStorage`, e);
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        const encodedValue = encode(value); // Encode using Base64
        storage.setItem(name, encodedValue);
      } catch (e) {
         console.error(`Failed to encode item "${name}" for sessionStorage`, e);
      }
    },
    removeItem: (name) => storage.removeItem(name),
  };
};

// Define the state shape. The key will be 'YYYY-WW' (e.g., '2024-30')
interface WeeklyReviewState {
  reviews: Record<string, WeeklyReviewData>;
  setReviews: (reviews: Record<string, WeeklyReviewData>) => void; // Action to overwrite state
  setJournalEntry: (weekKey: string, journal: string) => void;
  setTransactionComment: (weekKey: string, transactionId: string, comment: string) => void;
  deleteTransactionComment: (weekKey: string, transactionId: string) => void;
  getReviewForWeek: (weekKey: string) => WeeklyReviewData | undefined;
  getTransactionComment: (weekKey: string, transactionId: string) => string | undefined;
  clearReviews: () => void; // Action to clear state
}

const initialState = {
    reviews: {},
};

export const useWeeklyReviewStore = create<WeeklyReviewState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setReviews: (reviews) => set({ reviews: reviews || {} }),

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

       setTransactionComment: (weekKey, transactionId, comment) => {
         set((state) => {
            const currentReview = state.reviews[weekKey] || { journal: '', transactionComments: {} };
             const newComments = { ...(currentReview.transactionComments || {}), [transactionId]: comment };
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

      deleteTransactionComment: (weekKey, transactionId) => {
         set((state) => {
             const currentReview = state.reviews[weekKey];
             if (!currentReview || !currentReview.transactionComments) return state;

             const newComments = { ...currentReview.transactionComments };
             delete newComments[transactionId];

             const updatedComments = Object.keys(newComments).length > 0 ? newComments : undefined;

             return {
                 reviews: {
                     ...state.reviews,
                     [weekKey]: {
                         ...currentReview,
                         transactionComments: updatedComments,
                     },
                 },
             };
         });
      },

      getReviewForWeek: (weekKey) => {
          return get().reviews[weekKey];
      },

      getTransactionComment: (weekKey, transactionId) => {
          return get().reviews[weekKey]?.transactionComments?.[transactionId];
      },
      clearReviews: () => set(initialState), // Resets to initial empty state

    }),
    {
      name: 'ifcGuru_weeklyReviews', // Unique name for session storage
      storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use encoded sessionStorage
       deserialize: (str) => {
         const state = JSON.parse(str);
         state.state.reviews = state.state.reviews || {};
         return state;
       },
    }
  )
);

// Helper function to generate the week key (YYYY-WW)
export const getWeekKey = (date: Date): string => {
  const year = getYear(date);
  const weekNumber = getISOWeek(date);
  return `${year}-${weekNumber.toString().padStart(2, '0')}`;
};