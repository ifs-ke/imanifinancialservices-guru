// src/store/weeklyReviewStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { encode, decode } from '@/lib/storage-utils';
import type { WeeklyReviewData } from '@/lib/types'; // Removed UserShareInfo as API calls are server-side
import { getISOWeek, getYear } from 'date-fns';
// Server actions are used directly in components now, not via store
// import { shareReviewApi, revokeShareApi, searchUserByEmailApi } from '@/app/actions/shareActions'; 
// import { auth } from '@clerk/nextjs'; // No client-side auth needed here


const createSessionStorageWithEncoding = (): StateStorage => {
  const storage = typeof window !== 'undefined' ? sessionStorage : undefined;
  return {
    getItem: (name) => {
      if (!storage) return null;
      const str = storage.getItem(name);
      if (!str) return null;
      try {
        const decodedStr = decode(str);
        return JSON.parse(decodedStr);
      } catch (e) {
        // console.error(`Failed to decode/parse item "${name}" from sessionStorage.`, e); // Console log disabled
        return null;
      }
    },
    setItem: (name, value) => {
      if (!storage) return;
      try {
        const stringifiedValue = JSON.stringify(value);
        const encodedValue = encode(stringifiedValue);
        storage.setItem(name, encodedValue);
      } catch (e) {
        // console.error(`Failed to encode/stringify and set item "${name}" for sessionStorage`, e); // Console log disabled
      }
    },
    removeItem: (name) => storage?.removeItem(name),
  };
};

export interface WeeklyReviewState {
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  isHydrated: boolean;
  setOwnedReviews: (reviews: Record<string, WeeklyReviewData>) => void;
  setSharedReviews: (reviews: Record<string, WeeklyReviewData>) => void;
  setJournalEntry: (weekKey: string, journal: string, ownerId: string) => void;
  setTransactionComment: (weekKey: string, transactionId: string, comment: string, ownerId: string) => void;
  deleteTransactionComment: (weekKey: string, transactionId: string, ownerId: string) => void;
  getReviewForWeek: (weekKey: string, ownerId: string, currentUserId: string | null) => WeeklyReviewData | undefined;
  getTransactionComment: (weekKey: string, transactionId: string, ownerId: string, currentUserId: string | null) => string | undefined;
  clearReviews: () => void;
}

const initialState = {
    ownedReviews: {},
    sharedReviews: {},
    isHydrated: false,
};

export const getWeekKey = (date: Date): string => {
  try {
      const year = getYear(date);
      const weekNumber = getISOWeek(date);
      if (weekNumber < 1 || weekNumber > 53) {
          // console.warn(`Invalid week number ${weekNumber} calculated for date ${date}. Defaulting to year-01.`); // Console log disabled
          return `${year}-01`; // Fallback for safety, though date-fns should be reliable
      }
      return `${year}-${weekNumber.toString().padStart(2, '0')}`;
  } catch (error) {
       // console.error("Error generating week key:", error); // Console log disabled
       return "invalid-week-key";
  }
};

export const useWeeklyReviewStore = create<WeeklyReviewState>()(
  persist(
    (set, get) => ({
      ...initialState,
      setOwnedReviews: (reviews) => {
          const validatedReviews = (typeof reviews === 'object' && reviews !== null) ? reviews : {};
          set({ ownedReviews: validatedReviews, isHydrated: true });
      },
      setSharedReviews: (reviews) => {
           const validatedReviews = (typeof reviews === 'object' && reviews !== null) ? reviews : {};
          set({ sharedReviews: validatedReviews, isHydrated: true });
      },
      setJournalEntry: (weekKey, journal, ownerId) => {
        set((state) => {
             const currentReview = state.ownedReviews[weekKey] || { ownerId: ownerId, journal: '', transactionComments: {}, sharedWith: [] };
             if (currentReview.ownerId !== ownerId) {
                 // console.warn(`Attempted to set journal for review not owned by ${ownerId}.`); // Console log disabled
                 return state;
             }
             return {
                 ownedReviews: { ...state.ownedReviews, [weekKey]: { ...currentReview, ownerId, journal: journal } },
             };
         });
      },
      setTransactionComment: (weekKey, transactionId, comment, ownerId) => {
        set((state) => {
             const reviewToUpdate = state.ownedReviews[weekKey];
             
             if (!reviewToUpdate) { // If review doesn't exist for the owner, create it
                  const newReviewShell = { ownerId, journal: '', transactionComments: { [transactionId]: comment }, sharedWith: [] };
                  return { ownedReviews: { ...state.ownedReviews, [weekKey]: newReviewShell } };
             }

             if (reviewToUpdate.ownerId !== ownerId) {
                 // console.warn(`Attempted to set comment for review not owned by ${ownerId}.`); // Console log disabled
                 return state; 
             }

             const newComments = { ...(reviewToUpdate.transactionComments || {}), [transactionId]: comment };
             if (comment.trim() === '') delete newComments[transactionId]; // Remove comment if empty
             const updatedReview = { ...reviewToUpdate, ownerId, transactionComments: Object.keys(newComments).length > 0 ? newComments : undefined };
             return { ownedReviews: { ...state.ownedReviews, [weekKey]: updatedReview } };
         });
      },
      deleteTransactionComment: (weekKey, transactionId, ownerId) => {
         set((state) => {
             const reviewToUpdate = state.ownedReviews[weekKey];
             if (!reviewToUpdate || reviewToUpdate.ownerId !== ownerId || !reviewToUpdate.transactionComments) {
                 // console.warn(`Attempted to delete comment for review not found, not owned, or without comments.`); // Console log disabled
                 return state; 
             }
             const newComments = { ...reviewToUpdate.transactionComments };
             delete newComments[transactionId];
             const updatedReview = { ...reviewToUpdate, ownerId, transactionComments: Object.keys(newComments).length > 0 ? newComments : undefined };
             return { ownedReviews: { ...state.ownedReviews, [weekKey]: updatedReview } };
         });
      },
      getReviewForWeek: (weekKey, ownerId, currentUserId) => {
           if (!currentUserId) return undefined; 
           if (ownerId === currentUserId && get().ownedReviews[weekKey]) {
               return get().ownedReviews[weekKey];
           }
           const sharedReview = get().sharedReviews[weekKey];
           if (sharedReview && sharedReview.ownerId === ownerId) {
                if (Array.isArray(sharedReview.sharedWith) && sharedReview.sharedWith.includes(currentUserId)) {
                    return sharedReview;
                } else {
                    // console.warn(`Access Denied: Attempt to access shared review without permission.`, { weekKey, ownerId, currentUserId }); // Console log disabled
                    return undefined;
                }
           }
           return undefined; 
      },
      getTransactionComment: (weekKey, transactionId, ownerId, currentUserId) => {
          const review = get().getReviewForWeek(weekKey, ownerId, currentUserId); 
          return review?.transactionComments?.[transactionId];
      },
      clearReviews: () => {
          // console.log("Clearing weekly review store state."); // Console log disabled
          set({ ...initialState, isHydrated: true });
      },
    }),
    {
      name: 'ifcGuru_weeklyReviews', 
      storage: createJSONStorage(createSessionStorageWithEncoding), // Use the new storage option
       onRehydrateStorage: () => (state) => {
         if (state) {
           state.isHydrated = true;
            // console.log("Weekly review store rehydrated."); // Console log disabled
         }
       },
       // partialize: (state) => ({ ownedReviews: state.ownedReviews, sharedReviews: state.sharedReviews }),
    }
  )
);
