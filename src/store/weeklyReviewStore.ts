import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { encode, decode } from '@/lib/storage-utils';
import type { WeeklyReviewData, UserShareInfo } from '@/lib/types';
import { getISOWeek, getYear } from 'date-fns';
// import { shareReviewApi, revokeShareApi, searchUserByEmailApi } from '@/app/actions/shareActions';
// import { auth } from '@clerk/nextjs'; // Re-enabled Clerk client auth - REMOVE - not meant for client side

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';

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
  setJournalEntry: (weekKey: string, journal: string, ownerId: string) => void;
  setTransactionComment: (weekKey: string, transactionId: string, comment: string, ownerId: string) => void;
  deleteTransactionComment: (weekKey: string, transactionId: string, ownerId: string) => void;
  getReviewForWeek: (weekKey: string, ownerId: string) => WeeklyReviewData | undefined;
  getTransactionComment: (weekKey: string, transactionId: string, ownerId: string) => string | undefined;
  clearReviews: () => void;
  // shareWeekReview: (weekKey: string, targetUserId: string) => Promise<void>;  // Removed from client
  // revokeWeekShare: (weekKey: string, targetUserId: string) => Promise<void>; // Removed from client
  // searchUserToShareWith: (email: string) => Promise<UserShareInfo | null>;  // Removed from client
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
       console.error("Error generating week key:", error); // Replaced logError
       return "invalid-week-key";
  }
};
// Helper to get current user ID using client-side auth hook
// const getCurrentUserId = (): string | null => { // REMOVE - use on server action now
//     const { userId } = auth(); // Use actual Clerk auth hook
//     return userId;
// };
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
         // const currentUserId = getCurrentUserId();  // REMOVE - this component cannot do that
         // if (ownerId !== currentUserId) { // REMOVE - this component cannot do that
         //     console.warn(`Security Warning: Attempted client-side journal update for non-owned review.`, { weekKey, ownerId, currentUserId }); // Replaced logWarn
         //     return;
         // }
         // if (!currentUserId) {  // REMOVE - this component cannot do that
         //     console.warn("Cannot set journal entry: User not available."); // Replaced logWarn
         //     return;
         // }
        set((state) => {
             const currentReview = state.ownedReviews[weekKey] || { ownerId: ownerId, journal: '', transactionComments: {}, sharedWith: [] };
             if (currentReview.ownerId !== ownerId) return state;
             return {
                 ownedReviews: { ...state.ownedReviews, [weekKey]: { ...currentReview, journal: journal } },
             };
         });
      },
      setTransactionComment: (weekKey, transactionId, comment, ownerId) => {
         // const currentUserId = getCurrentUserId();  // REMOVE - this component cannot do that
         // if (!currentUserId) { // REMOVE - this component cannot do that
         //     console.warn("Cannot set transaction comment: User not available."); // Replaced logWarn
         //     return;
         // }
        set((state) => {
             let reviewToUpdate: WeeklyReviewData | undefined;
             let reviewsMapKey: 'ownedReviews' | 'sharedReviews' | null = null;
             if (state.ownedReviews[weekKey]?.ownerId === ownerId) {
                 reviewToUpdate = state.ownedReviews[weekKey];
                 reviewsMapKey = 'ownedReviews';
             } else if (state.sharedReviews[weekKey]?.ownerId === ownerId) {
                 reviewToUpdate = state.sharedReviews[weekKey];
                 reviewsMapKey = 'sharedReviews';
                  // Check if current user is allowed to comment (either owner or in sharedWith)
                  // if (ownerId !== currentUserId && !(reviewToUpdate?.sharedWith?.includes(currentUserId))) { // REMOVE - this component cannot do that
                  //    console.warn(`Permission Denied: User cannot comment on review.`, { currentUserId, weekKey, ownerId }); // Replaced logWarn
                  //    return state;
                  // }
             }
             // If no existing review found, and the owner is the current user, create a new owned review shell
             // if (!reviewToUpdate && ownerId === currentUserId) { // REMOVE - this component cannot do that
             if (!reviewToUpdate && ownerId === 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y') {
                  reviewToUpdate = { ownerId, journal: '', transactionComments: {}, sharedWith: [] };
                  reviewsMapKey = 'ownedReviews';
             } else if (!reviewToUpdate) {
                  // If no review found and owner isn't current user, cannot proceed
                  console.error(`Cannot set comment: Review not found or permission denied.`, { weekKey, ownerId }); // Replaced logError
                  return state;
             }
             const newComments = { ...(reviewToUpdate.transactionComments || {}), [transactionId]: comment };
             if (comment.trim() === '') delete newComments[transactionId]; // Remove comment if empty
             const updatedReview = { ...reviewToUpdate, transactionComments: Object.keys(newComments).length > 0 ? newComments : undefined };
             if (reviewsMapKey === 'ownedReviews') return { ownedReviews: { ...state.ownedReviews, [weekKey]: updatedReview } };
             if (reviewsMapKey === 'sharedReviews') return { sharedReviews: { ...state.sharedReviews, [weekKey]: updatedReview } };
             return state;
         });
      },
      deleteTransactionComment: (weekKey, transactionId, ownerId) => {
          // const currentUserId = getCurrentUserId(); // REMOVE - this component cannot do that
          // if (!currentUserId) { // REMOVE - this component cannot do that
          //     console.warn("Cannot delete transaction comment: User not available."); // Replaced logWarn
          //     return;
          // }
         set((state) => {
             let reviewsMapKey: 'ownedReviews' | 'sharedReviews' | null = null;
             let reviewToUpdate: WeeklyReviewData | undefined;
             if (state.ownedReviews[weekKey]?.ownerId === ownerId) {
                 reviewToUpdate = state.ownedReviews[weekKey];
                 reviewsMapKey = 'ownedReviews';
             } else if (state.sharedReviews[weekKey]?.ownerId === ownerId) {
                 reviewToUpdate = state.sharedReviews[weekKey];
                 reviewsMapKey = 'sharedReviews';
                  // Check if current user is allowed to delete comment (either owner or in sharedWith)
                  // if (ownerId !== currentUserId && !(reviewToUpdate?.sharedWith?.includes(currentUserId))) { // REMOVE - this component cannot do that
                  //    console.warn(`Permission Denied: User cannot delete comments.`, { currentUserId, weekKey, ownerId }); // Replaced logWarn
                  //    return state;
                  // }
             } else {
                 console.error(`Cannot delete comment: Review not found or permission denied.`, { weekKey, ownerId }); // Replaced logError
                 return state;
             }
             if (!reviewToUpdate || !reviewToUpdate.transactionComments) return state; // No comments to delete from
             const newComments = { ...reviewToUpdate.transactionComments };
             delete newComments[transactionId];
             const updatedReview = { ...reviewToUpdate, transactionComments: Object.keys(newComments).length > 0 ? newComments : undefined };
             if (reviewsMapKey === 'ownedReviews') return { ownedReviews: { ...state.ownedReviews, [weekKey]: updatedReview } };
             if (reviewsMapKey === 'sharedReviews') return { sharedReviews: { ...state.sharedReviews, [weekKey]: updatedReview } };
             return state;
         });
      },
      getReviewForWeek: (weekKey, ownerId) => {
          // const currentUserId = getCurrentUserId(); // REMOVE - this component cannot do that
          // if (!currentUserId) return undefined;  // REMOVE - this component cannot do that
           // Check owned reviews first
           // if (ownerId === currentUserId && get().ownedReviews[weekKey]) {  // REMOVE - this component cannot do that
           if (ownerId === 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y' && get().ownedReviews[weekKey]) {
               return get().ownedReviews[weekKey];
           }
           // Then check shared reviews
           const sharedReview = get().sharedReviews[weekKey];
           // Ensure the requested owner matches and the current user has permission
           if (sharedReview && sharedReview.ownerId === ownerId) {
                // if (sharedReview.sharedWith?.includes(currentUserId)) { // REMOVE - this component cannot do that
                if (sharedReview.sharedWith?.includes('user_2wXc4D8KBDKGhxagoRStZOXnP2Y')) {
                    return sharedReview;
                } else {
                    console.warn(`Access Denied: Attempt to access shared review without permission.`, { weekKey, ownerId }); // Replaced logWarn
                    return undefined;
                }
           }
           return undefined; // Not found or no permission
      },
      getTransactionComment: (weekKey, transactionId, ownerId) => {
          const review = get().getReviewForWeek(weekKey, ownerId);
          return review?.transactionComments?.[transactionId];
      },
      clearReviews: () => {
          console.log("Clearing weekly review store state."); // Replaced logInfo
          set({ ...initialState, isHydrated: true });
      },
       // These are not longer in the client
      // shareWeekReview: async (weekKey, targetUserId) => {
      // },
      // revokeWeekShare: async (weekKey, targetUserId) => {
      // },
      // searchUserToShareWith: async (email: string): Promise<UserShareInfo | null> => {
      // },
    }),
    {
      name: 'ifcGuru_weeklyReviews', // Persistence key
      storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use session storage with encoding
       onRehydrateStorage: () => (state) => {
         if (state) {
           state.isHydrated = true;
            console.log("Weekly review store rehydrated."); // Replaced logInfo
         }
       },
    }
  )
);
