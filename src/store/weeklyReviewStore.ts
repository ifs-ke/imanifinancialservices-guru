// src/store/weeklyReviewStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { encode, decode } from '@/lib/storage-utils'; // Import encoding/decoding utils
import type { WeeklyReviewData, UserShareInfo } from '@/lib/types'; // Import types
import { getISOWeek, getYear } from 'date-fns'; // Import date-fns helpers
import { shareReviewApi, revokeShareApi, searchUserByEmailApi } from '@/app/actions/shareActions'; // Import server actions

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

// Define the state shape
interface WeeklyReviewState {
  // Store owned reviews separately from reviews shared with the current user
  ownedReviews: Record<string, WeeklyReviewData>; // key: 'YYYY-WW'
  sharedReviews: Record<string, WeeklyReviewData>; // key: 'YYYY-WW', data includes original ownerId
  setOwnedReviews: (reviews: Record<string, WeeklyReviewData>) => void;
  setSharedReviews: (reviews: Record<string, WeeklyReviewData>) => void;
  setJournalEntry: (weekKey: string, journal: string, ownerId: string) => void; // Need ownerId to know which review to update
  setTransactionComment: (weekKey: string, transactionId: string, comment: string, ownerId: string) => void; // Need ownerId
  deleteTransactionComment: (weekKey: string, transactionId: string, ownerId: string) => void; // Need ownerId
  getReviewForWeek: (weekKey: string, ownerId: string) => WeeklyReviewData | undefined;
  getTransactionComment: (weekKey: string, transactionId: string, ownerId: string) => string | undefined;
  clearReviews: () => void;
  // Sharing specific actions
  shareWeekReview: (weekKey: string, targetUserId: string) => Promise<void>;
  revokeWeekShare: (weekKey: string, targetUserId: string) => Promise<void>;
  searchUserToShareWith: (email: string) => Promise<UserShareInfo | null>;
}

const initialState = {
    ownedReviews: {},
    sharedReviews: {},
};

// Helper function to generate the week key (YYYY-WW)
export const getWeekKey = (date: Date): string => {
  const year = getYear(date);
  const weekNumber = getISOWeek(date);
  return `${year}-${weekNumber.toString().padStart(2, '0')}`;
};


export const useWeeklyReviewStore = create<WeeklyReviewState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setOwnedReviews: (reviews) => set({ ownedReviews: reviews || {} }),
      setSharedReviews: (reviews) => set({ sharedReviews: reviews || {} }),

      // Updates journal for either owned or shared reviews (checks ownerId)
      setJournalEntry: (weekKey, journal, ownerId) => {
        // This action should only be called when saving a journal entry for a review the CURRENT user owns or has write access to (if implemented).
        // The API/server action called by useSyncManager should handle saving changes to the correct owner's document.
        // This client-side update reflects the change immediately, assuming the API call succeeds.
        set((state) => {
            const currentUserId = ''; // TODO: Get current user ID from Clerk/Auth context
            if (ownerId === currentUserId) { // Updating owned review
                const currentReview = state.ownedReviews[weekKey] || { ownerId, journal: '', transactionComments: {} };
                return {
                    ownedReviews: {
                        ...state.ownedReviews,
                        [weekKey]: {
                            ...currentReview,
                            journal: journal,
                        },
                    },
                };
            } else { // Potentially updating a shared review (less common for journal, mainly comments)
                console.warn("Attempting to set journal for a potentially shared review client-side. This should ideally be handled via API response after saving.");
                // Update shared review state ONLY IF NEEDED based on API design.
                // It's often better to rely on the next sync/fetch to update shared review state.
                const currentReview = state.sharedReviews[weekKey];
                if (currentReview && currentReview.ownerId === ownerId) {
                     return {
                         sharedReviews: {
                             ...state.sharedReviews,
                             [weekKey]: { ...currentReview, journal: journal }
                         }
                     };
                 }
                 return state; // No change if not found or owner doesn't match
             }
         });
      },

      // Updates comment for either owned or shared reviews
      setTransactionComment: (weekKey, transactionId, comment, ownerId) => {
        // Similar logic to setJournalEntry: update local state optimistically, rely on API for persistence.
        set((state) => {
            const currentUserId = ''; // TODO: Get current user ID from Clerk/Auth context
            let reviewToUpdate: WeeklyReviewData | undefined;
            let isOwned = false;

            if (ownerId === currentUserId) {
                reviewToUpdate = state.ownedReviews[weekKey] || { ownerId, journal: '', transactionComments: {}, sharedWith: [] };
                isOwned = true;
            } else {
                 reviewToUpdate = state.sharedReviews[weekKey];
                 if (!reviewToUpdate || reviewToUpdate.ownerId !== ownerId) {
                     console.error(`Cannot set comment: Shared review for week ${weekKey} with owner ${ownerId} not found.`);
                     return state; // No change
                 }
             }

            const newComments = { ...(reviewToUpdate.transactionComments || {}), [transactionId]: comment };
            if (comment.trim() === '') {
                delete newComments[transactionId];
            }

            const updatedReview = {
                ...reviewToUpdate,
                transactionComments: Object.keys(newComments).length > 0 ? newComments : undefined,
            };

            if (isOwned) {
                 return { ownedReviews: { ...state.ownedReviews, [weekKey]: updatedReview } };
             } else {
                 return { sharedReviews: { ...state.sharedReviews, [weekKey]: updatedReview } };
             }
        });
      },

      deleteTransactionComment: (weekKey, transactionId, ownerId) => {
         set((state) => {
            const currentUserId = ''; // TODO: Get current user ID from Clerk/Auth context
             let reviewsMapKey: 'ownedReviews' | 'sharedReviews' | null = null;
             let reviewToUpdate: WeeklyReviewData | undefined;

            if (ownerId === currentUserId) {
                 reviewToUpdate = state.ownedReviews[weekKey];
                 reviewsMapKey = 'ownedReviews';
             } else {
                 reviewToUpdate = state.sharedReviews[weekKey];
                 if (reviewToUpdate && reviewToUpdate.ownerId === ownerId) {
                     reviewsMapKey = 'sharedReviews';
                 } else {
                     console.error(`Cannot delete comment: Review for week ${weekKey} with owner ${ownerId} not found.`);
                     return state; // No change
                 }
             }

             if (!reviewToUpdate || !reviewToUpdate.transactionComments) return state; // No comments to delete from

             const newComments = { ...reviewToUpdate.transactionComments };
             delete newComments[transactionId];

             const updatedReview = {
                 ...reviewToUpdate,
                 transactionComments: Object.keys(newComments).length > 0 ? newComments : undefined,
             };

             if (reviewsMapKey === 'ownedReviews') {
                 return { ownedReviews: { ...state.ownedReviews, [weekKey]: updatedReview } };
             } else if (reviewsMapKey === 'sharedReviews') {
                 return { sharedReviews: { ...state.sharedReviews, [weekKey]: updatedReview } };
             }
             return state; // Should not happen
         });
      },

      // Gets review data, checking both owned and shared
      getReviewForWeek: (weekKey, ownerId) => {
          const currentUserId = ''; // TODO: Get current user ID from Clerk/Auth context
          if (ownerId === currentUserId) {
              return get().ownedReviews[weekKey];
          } else {
              const shared = get().sharedReviews[weekKey];
              // Verify ownerId matches for shared reviews
              return shared && shared.ownerId === ownerId ? shared : undefined;
          }
      },

      getTransactionComment: (weekKey, transactionId, ownerId) => {
          const review = get().getReviewForWeek(weekKey, ownerId);
          return review?.transactionComments?.[transactionId];
      },

      clearReviews: () => set(initialState), // Resets both owned and shared

      // --- Sharing Actions ---
      shareWeekReview: async (weekKey, targetUserId) => {
         const currentUserId = ''; // TODO: Get current user ID from Clerk/Auth context
         if (!currentUserId) throw new Error("User not authenticated");

          set((state) => {
             // Optimistic UI update: Add targetUserId to sharedWith array
             const review = state.ownedReviews[weekKey];
             if (!review) return state; // Should not happen if UI allows sharing
             const updatedSharedWith = Array.from(new Set([...(review.sharedWith || []), targetUserId]));
             return {
                 ownedReviews: {
                     ...state.ownedReviews,
                     [weekKey]: { ...review, sharedWith: updatedSharedWith },
                 },
             };
         });

         try {
             await shareReviewApi(weekKey, targetUserId);
             // API call successful, state is already updated optimistically
         } catch (error) {
             console.error("Failed to share review:", error);
              // Rollback optimistic update on failure
              set((state) => {
                 const review = state.ownedReviews[weekKey];
                 if (!review) return state;
                 const updatedSharedWith = (review.sharedWith || []).filter(id => id !== targetUserId);
                 return {
                     ownedReviews: {
                         ...state.ownedReviews,
                         [weekKey]: { ...review, sharedWith: updatedSharedWith.length > 0 ? updatedSharedWith : undefined },
                     },
                 };
             });
             throw error; // Re-throw for UI handling
         }
      },

      revokeWeekShare: async (weekKey, targetUserId) => {
         const currentUserId = ''; // TODO: Get current user ID from Clerk/Auth context
         if (!currentUserId) throw new Error("User not authenticated");

         const originalSharedWith = get().ownedReviews[weekKey]?.sharedWith;

          set((state) => {
             // Optimistic UI update
             const review = state.ownedReviews[weekKey];
             if (!review || !review.sharedWith) return state;
             const updatedSharedWith = review.sharedWith.filter(id => id !== targetUserId);
             return {
                 ownedReviews: {
                     ...state.ownedReviews,
                     [weekKey]: { ...review, sharedWith: updatedSharedWith.length > 0 ? updatedSharedWith : undefined },
                 },
             };
         });

         try {
             await revokeShareApi(weekKey, targetUserId);
         } catch (error) {
             console.error("Failed to revoke share:", error);
              // Rollback optimistic update
              set((state) => {
                 const review = state.ownedReviews[weekKey];
                 if (!review) return state; // Should ideally not happen
                 return {
                     ownedReviews: {
                         ...state.ownedReviews,
                         [weekKey]: { ...review, sharedWith: originalSharedWith }, // Restore original list
                     },
                 };
              });
             throw error;
         }
      },

       // Search for a user by email (calls server action)
       searchUserToShareWith: async (email: string): Promise<UserShareInfo | null> => {
           try {
               const user = await searchUserByEmailApi(email);
               return user;
           } catch (error) {
               console.error("Error searching for user:", error);
               return null; // Return null on error or not found
           }
       },

    }),
    {
      name: 'ifcGuru_weeklyReviews', // Unique name for session storage
      storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use encoded sessionStorage
      // No custom deserialize needed unless storing complex types like Date that need revival
      // Dates (weekKey) are stored as strings anyway.
       deserialize: (str) => {
         const state = JSON.parse(str);
         state.state.ownedReviews = state.state.ownedReviews || {};
         state.state.sharedReviews = state.state.sharedReviews || {};
         return state;
       },
    }
  )
);
