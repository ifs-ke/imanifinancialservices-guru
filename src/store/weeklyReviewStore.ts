// src/store/weeklyReviewStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { encode, decode } from '@/lib/storage-utils'; // Import encoding/decoding utils
import type { WeeklyReviewData, UserShareInfo } from '@/lib/types'; // Import types
import { getISOWeek, getYear } from 'date-fns'; // Import date-fns helpers
import { shareReviewApi, revokeShareApi, searchUserByEmailApi } from '@/app/actions/shareActions'; // Import server actions
import { useAuth } from '@clerk/nextjs'; // To get current user ID

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
  ownedReviews: Record<string, WeeklyReviewData>; // key: 'YYYY-WW'
  sharedReviews: Record<string, WeeklyReviewData>; // key: 'YYYY-WW', data includes original ownerId
  setOwnedReviews: (reviews: Record<string, WeeklyReviewData>) => void;
  setSharedReviews: (reviews: Record<string, WeeklyReviewData>) => void;
  setJournalEntry: (weekKey: string, journal: string, ownerId: string) => void;
  setTransactionComment: (weekKey: string, transactionId: string, comment: string, ownerId: string) => void;
  deleteTransactionComment: (weekKey: string, transactionId: string, ownerId: string) => void;
  getReviewForWeek: (weekKey: string, ownerId: string) => WeeklyReviewData | undefined;
  getTransactionComment: (weekKey: string, transactionId: string, ownerId: string) => string | undefined;
  clearReviews: () => void;
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


// Helper to get current user ID (encapsulated)
const getCurrentUserId = (): string | null => {
    // This relies on Clerk being loaded client-side.
    // In server actions, use auth() directly.
    try {
      return useAuth.getState().userId;
    } catch (e) {
        // This might happen if called outside React component context initially.
        // Consider alternative ways to get userId if needed outside components.
        console.warn("useAuth.getState() failed, likely called outside component context.");
        return null;
    }
};


export const useWeeklyReviewStore = create<WeeklyReviewState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setOwnedReviews: (reviews) => set({ ownedReviews: reviews || {} }),
      setSharedReviews: (reviews) => set({ sharedReviews: reviews || {} }),

      setJournalEntry: (weekKey, journal, ownerId) => {
         const currentUserId = getCurrentUserId();
         // Only allow setting journal for owned reviews client-side
         if (ownerId !== currentUserId) {
             console.warn("Client-side journal update attempt for non-owned review blocked.");
             return;
         }
        set((state) => {
             const currentReview = state.ownedReviews[weekKey] || { ownerId, journal: '', transactionComments: {}, sharedWith: [] };
             return {
                 ownedReviews: {
                     ...state.ownedReviews,
                     [weekKey]: { ...currentReview, journal: journal },
                 },
             };
         });
      },

      setTransactionComment: (weekKey, transactionId, comment, ownerId) => {
         const currentUserId = getCurrentUserId();
         set((state) => {
             let reviewToUpdate: WeeklyReviewData | undefined;
             let isOwned = false;
             let reviewsMapKey: 'ownedReviews' | 'sharedReviews' | null = null;

             if (ownerId === currentUserId) {
                 reviewToUpdate = state.ownedReviews[weekKey] || { ownerId, journal: '', transactionComments: {}, sharedWith: [] };
                 isOwned = true;
                 reviewsMapKey = 'ownedReviews';
             } else {
                  reviewToUpdate = state.sharedReviews[weekKey];
                  if (!reviewToUpdate || reviewToUpdate.ownerId !== ownerId) {
                      console.error(`Cannot set comment: Shared review for week ${weekKey} with owner ${ownerId} not found.`);
                      return state; // No change
                  }
                  reviewsMapKey = 'sharedReviews';
              }

             const newComments = { ...(reviewToUpdate.transactionComments || {}), [transactionId]: comment };
             if (comment.trim() === '') {
                 delete newComments[transactionId];
             }

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

      deleteTransactionComment: (weekKey, transactionId, ownerId) => {
          const currentUserId = getCurrentUserId();
         set((state) => {
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

             if (!reviewToUpdate || !reviewToUpdate.transactionComments) return state;

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
             return state;
         });
      },

      getReviewForWeek: (weekKey, ownerId) => {
           const currentUserId = getCurrentUserId();
           if (!currentUserId) return undefined; // No user logged in

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

      clearReviews: () => set(initialState),

      shareWeekReview: async (weekKey, targetUserId) => {
          const currentUserId = getCurrentUserId();
          if (!currentUserId) throw new Error("User not authenticated");

          // Optimistic UI update
          set((state) => {
             const review = state.ownedReviews[weekKey];
             if (!review || review.ownerId !== currentUserId) return state; // Ensure ownership
             const updatedSharedWith = Array.from(new Set([...(review.sharedWith || []), targetUserId])).sort(); // Add and sort
             return {
                 ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: updatedSharedWith } },
             };
          });

          try {
             await shareReviewApi(weekKey, targetUserId);
          } catch (error) {
             console.error("Failed to share review:", error);
             // Rollback optimistic update
             set((state) => {
                 const review = state.ownedReviews[weekKey];
                 if (!review || review.ownerId !== currentUserId) return state;
                 const originalSharedWith = (review.sharedWith || []).filter(id => id !== targetUserId); // Remove the added ID
                 return {
                     ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: originalSharedWith.length > 0 ? originalSharedWith : undefined } },
                 };
             });
             throw error;
          }
      },

      revokeWeekShare: async (weekKey, targetUserId) => {
          const currentUserId = getCurrentUserId();
          if (!currentUserId) throw new Error("User not authenticated");
          const originalSharedWith = get().ownedReviews[weekKey]?.sharedWith; // Store original before optimistic update

          // Optimistic UI update
          set((state) => {
             const review = state.ownedReviews[weekKey];
             if (!review || !review.sharedWith || review.ownerId !== currentUserId) return state;
             const updatedSharedWith = review.sharedWith.filter(id => id !== targetUserId);
             return {
                 ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: updatedSharedWith.length > 0 ? updatedSharedWith : undefined } },
             };
          });

          try {
             await revokeShareApi(weekKey, targetUserId);
          } catch (error) {
             console.error("Failed to revoke share:", error);
             // Rollback optimistic update
             set((state) => {
                 const review = state.ownedReviews[weekKey];
                 if (!review || review.ownerId !== currentUserId) return state;
                 return {
                     ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: originalSharedWith } }, // Restore original list
                 };
              });
             throw error;
          }
      },

      searchUserToShareWith: async (email: string): Promise<UserShareInfo | null> => {
           try {
               const user = await searchUserByEmailApi(email);
               return user;
           } catch (error) {
               console.error("Error searching for user:", error);
               // Consider re-throwing specific errors if needed by UI
               return null;
           }
       },

    }),
    {
      name: 'ifcGuru_weeklyReviews',
      storage: createJSONStorage(() => createSessionStorageWithEncoding()),
      // No custom serialization/deserialization needed for this structure
       deserialize: (str) => {
         const state = JSON.parse(str);
         // Ensure maps exist on hydration
         state.state.ownedReviews = state.state.ownedReviews || {};
         state.state.sharedReviews = state.state.sharedReviews || {};
         return state;
       },
    }
  )
);
