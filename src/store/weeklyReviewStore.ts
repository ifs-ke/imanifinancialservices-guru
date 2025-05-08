import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { encode, decode } from '@/lib/storage-utils';
import type { WeeklyReviewData, UserShareInfo } from '@/lib/types';
import { getISOWeek, getYear } from 'date-fns';
// import { shareReviewApi, revokeShareApi, searchUserByEmailApi } from '@/app/actions/shareActions'; // Actions moved to server
// import { auth } from '@clerk/nextjs/client'; // Removed client-side Clerk hook

// Placeholder used only if NEEDED (e.g., during initial state before auth loads), but prefer real ID
// const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';

const createSessionStorageWithEncoding = (): StateStorage => {
  const storage = sessionStorage;
  return {
    getItem: (name) => {
      const str = storage.getItem(name);
      if (!str) return null;
      try {
        const decodedStr = decode(str);
        return decodedStr;
      } catch (e) {
        console.error(`Failed to decode item "${name}" from sessionStorage. Item might not be Base64 encoded or is corrupted.`, e);
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        const encodedValue = encode(value);
        storage.setItem(name, encodedValue);
      } catch (e) {
         console.error(`Failed to encode and set item "${name}" for sessionStorage`, e);
      }
    },
    removeItem: (name) => storage.removeItem(name),
  };
};

interface WeeklyReviewState {
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  isHydrated: boolean;
  setOwnedReviews: (reviews: Record<string, WeeklyReviewData>) => void;
  setSharedReviews: (reviews: Record<string, WeeklyReviewData>) => void;
  // Updated signatures to only require data, ownerId check should happen where action is called
  setJournalEntry: (weekKey: string, journal: string, ownerId: string) => void;
  setTransactionComment: (weekKey: string, transactionId: string, comment: string, ownerId: string) => void;
  deleteTransactionComment: (weekKey: string, transactionId: string, ownerId: string) => void;
  // getReviewForWeek needs the *current* user's ID to check permissions
  getReviewForWeek: (weekKey: string, ownerId: string, currentUserId: string | null) => WeeklyReviewData | undefined;
  // getTransactionComment also needs the *current* user's ID
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
          throw new Error(`Invalid week number ${weekNumber} calculated for date ${date}`);
      }
      return `${year}-${weekNumber.toString().padStart(2, '0')}`;
  } catch (error) {
       // console.error("Error generating week key:", error); // Console log commented out
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
      // Assume ownerId check happened before calling this
      setJournalEntry: (weekKey, journal, ownerId) => {
        set((state) => {
             // Only update ownedReviews as shared reviews are read-only client-side
             const currentReview = state.ownedReviews[weekKey] || { ownerId: ownerId, journal: '', transactionComments: {}, sharedWith: [] };
             // Double check ownership before modifying owned reviews
             if (currentReview.ownerId !== ownerId) {
                 // console.warn(`Attempted to set journal for review not owned by ${ownerId}.`); // Console log commented out
                 return state;
             }
             return {
                 ownedReviews: { ...state.ownedReviews, [weekKey]: { ...currentReview, journal: journal } },
             };
         });
      },
      // Assume ownerId check happened before calling this
      setTransactionComment: (weekKey, transactionId, comment, ownerId) => {
        set((state) => {
             // Only update ownedReviews
             const reviewToUpdate = state.ownedReviews[weekKey];
             if (!reviewToUpdate || reviewToUpdate.ownerId !== ownerId) {
                  // console.warn(`Attempted to set comment for review not found or not owned by ${ownerId}.`); // Console log commented out
                  // Optionally create a shell if it doesn't exist for the owner
                  if (!reviewToUpdate && Object.keys(state.ownedReviews).length === 0 ) { // Create only if NO owned reviews exist for this user yet? Or always?
                      const newReviewShell = { ownerId, journal: '', transactionComments: { [transactionId]: comment }, sharedWith: [] };
                      return { ownedReviews: { ...state.ownedReviews, [weekKey]: newReviewShell } };
                  } else if (!reviewToUpdate) {
                      return state; // Don't create if other reviews exist? Needs defined behavior.
                  }
                  return state; // Not owned
             }

             const newComments = { ...(reviewToUpdate.transactionComments || {}), [transactionId]: comment };
             if (comment.trim() === '') delete newComments[transactionId];
             const updatedReview = { ...reviewToUpdate, transactionComments: Object.keys(newComments).length > 0 ? newComments : undefined };
             return { ownedReviews: { ...state.ownedReviews, [weekKey]: updatedReview } };
         });
      },
       // Assume ownerId check happened before calling this
      deleteTransactionComment: (weekKey, transactionId, ownerId) => {
         set((state) => {
             // Only delete from ownedReviews
             const reviewToUpdate = state.ownedReviews[weekKey];
             if (!reviewToUpdate || reviewToUpdate.ownerId !== ownerId || !reviewToUpdate.transactionComments) {
                 // console.warn(`Attempted to delete comment for review not found, not owned, or without comments.`); // Console log commented out
                 return state; // Not found, not owned, or no comments exist
             }

             const newComments = { ...reviewToUpdate.transactionComments };
             delete newComments[transactionId];
             const updatedReview = { ...reviewToUpdate, transactionComments: Object.keys(newComments).length > 0 ? newComments : undefined };
             return { ownedReviews: { ...state.ownedReviews, [weekKey]: updatedReview } };
         });
      },
      // getReviewForWeek needs the *current* user's ID passed in
      getReviewForWeek: (weekKey, ownerId, currentUserId) => {
           if (!currentUserId) return undefined; // Cannot determine permissions without current user

           // Check owned reviews first
           if (ownerId === currentUserId && get().ownedReviews[weekKey]) {
               return get().ownedReviews[weekKey];
           }
           // Then check shared reviews
           const sharedReview = get().sharedReviews[weekKey];
           // Ensure the requested owner matches and the current user has permission
           if (sharedReview && sharedReview.ownerId === ownerId) {
                if (sharedReview.sharedWith?.includes(currentUserId)) {
                    return sharedReview;
                } else {
                    // console.warn(`Access Denied: Attempt to access shared review without permission.`, { weekKey, ownerId }); // Console log commented out
                    return undefined;
                }
           }
           return undefined; // Not found or no permission
      },
       // getTransactionComment also needs the *current* user's ID passed in
      getTransactionComment: (weekKey, transactionId, ownerId, currentUserId) => {
          const review = get().getReviewForWeek(weekKey, ownerId, currentUserId); // Use the permission-checked getter
          return review?.transactionComments?.[transactionId];
      },
      clearReviews: () => {
          // console.log("Clearing weekly review store state."); // Console log commented out
          set({ ...initialState, isHydrated: true });
      },
    }),
    {
      name: 'ifcGuru_weeklyReviews', // Persistence key
      storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use session storage with encoding
       onRehydrateStorage: () => (state) => {
         if (state) {
           state.isHydrated = true;
            // console.log("Weekly review store rehydrated."); // Console log commented out
         }
       },
    }
  )
);
