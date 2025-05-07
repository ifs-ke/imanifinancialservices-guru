// src/store/weeklyReviewStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { encode, decode } from '@/lib/storage-utils';
import type { WeeklyReviewData, UserShareInfo } from '@/lib/types';
import { getISOWeek, getYear } from 'date-fns';
import { shareReviewApi, revokeShareApi, searchUserByEmailApi } from '@/app/actions/shareActions';
import { auth } from '@clerk/nextjs'; // Re-enabled Clerk client auth
// Logger removed


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
  shareWeekReview: (weekKey: string, targetUserId: string) => Promise<void>;
  revokeWeekShare: (weekKey: string, targetUserId: string) => Promise<void>;
  searchUserToShareWith: (email: string) => Promise<UserShareInfo | null>;
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
const getCurrentUserId = (): string | null => {
    const { userId } = auth(); // Use actual Clerk auth hook
    return userId;
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
         const currentUserId = getCurrentUserId();
         if (ownerId !== currentUserId) {
             console.warn(`Security Warning: Attempted client-side journal update for non-owned review.`, { weekKey, ownerId, currentUserId }); // Replaced logWarn
             return;
         }
         if (!currentUserId) {
             console.warn("Cannot set journal entry: User not available."); // Replaced logWarn
             return;
         }
        set((state) => {
             const currentReview = state.ownedReviews[weekKey] || { ownerId: currentUserId, journal: '', transactionComments: {}, sharedWith: [] };
             if (currentReview.ownerId !== currentUserId) return state;
             return {
                 ownedReviews: { ...state.ownedReviews, [weekKey]: { ...currentReview, journal: journal } },
             };
         });
      },

      setTransactionComment: (weekKey, transactionId, comment, ownerId) => {
         const currentUserId = getCurrentUserId();
         if (!currentUserId) {
             console.warn("Cannot set transaction comment: User not available."); // Replaced logWarn
             return;
         }
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
                 if (ownerId !== currentUserId && !(reviewToUpdate?.sharedWith?.includes(currentUserId))) {
                     console.warn(`Permission Denied: User cannot comment on review.`, { currentUserId, weekKey, ownerId }); // Replaced logWarn
                     return state;
                 }
             }

             // If no existing review found, and the owner is the current user, create a new owned review shell
             if (!reviewToUpdate && ownerId === currentUserId) {
                  reviewToUpdate = { ownerId, journal: '', transactionComments: {}, sharedWith: [] };
                  reviewsMapKey = 'ownedReviews';
             } else if (!reviewToUpdate) {
                  // If no review found and owner isn't current user, cannot proceed
                  console.error(`Cannot set comment: Review not found or permission denied.`, { weekKey, ownerId, currentUserId }); // Replaced logError
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
          const currentUserId = getCurrentUserId();
          if (!currentUserId) {
              console.warn("Cannot delete transaction comment: User not available."); // Replaced logWarn
              return;
          }
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
                  if (ownerId !== currentUserId && !(reviewToUpdate?.sharedWith?.includes(currentUserId))) {
                     console.warn(`Permission Denied: User cannot delete comments.`, { currentUserId, weekKey, ownerId }); // Replaced logWarn
                     return state;
                 }
             } else {
                 console.error(`Cannot delete comment: Review not found or permission denied.`, { weekKey, ownerId, currentUserId }); // Replaced logError
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
           const currentUserId = getCurrentUserId();
           if (!currentUserId) return undefined;

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
                    console.warn(`Access Denied: Attempt to access shared review without permission.`, { currentUserId, weekKey, ownerId }); // Replaced logWarn
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

      shareWeekReview: async (weekKey, targetUserId) => {
          const currentUserId = getCurrentUserId();
          if (!currentUserId) throw new Error("User not available to share.");
          if (currentUserId === targetUserId) throw new Error("Cannot share review with yourself.");

          // Optimistically update the local state
          set((state) => {
             const review = state.ownedReviews[weekKey];
             // Ensure the review exists and is owned by the current user before updating
             if (!review || review.ownerId !== currentUserId) {
                  console.error(`Share failed: Review not found or not owned. Cannot update state.`, { weekKey, currentUserId }); // Replaced logError
                 return state; // Return current state without modification
             }
             const updatedSharedWith = Array.from(new Set([...(review.sharedWith || []), targetUserId])).sort();
             return { ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: updatedSharedWith } } };
          });

          // Call the server action
          try {
             await shareReviewApi(weekKey, targetUserId);
             console.log(`Successfully initiated share for review ${weekKey} with ${targetUserId}.`); // Replaced logInfo
          } catch (error) {
             console.error("Failed to share review via API:", error); // Replaced logError
             // Rollback the optimistic update if the API call fails
             set((state) => {
                 const review = state.ownedReviews[weekKey];
                 if (!review || review.ownerId !== currentUserId) return state; // Should still exist
                 const originalSharedWith = (review.sharedWith || []).filter(id => id !== targetUserId);
                 return { ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: originalSharedWith.length > 0 ? originalSharedWith : undefined } } };
             });
             throw error; // Re-throw the error to be caught by the caller
          }
      },

      revokeWeekShare: async (weekKey, targetUserId) => {
          const currentUserId = getCurrentUserId();
          if (!currentUserId) throw new Error("User not available to revoke share.");
          const originalSharedWith = get().ownedReviews[weekKey]?.sharedWith; // Store original state for rollback

          // Optimistically update local state
          set((state) => {
             const review = state.ownedReviews[weekKey];
             // Ensure review exists, is owned, and actually shared with the target before updating
             if (!review || !review.sharedWith || review.ownerId !== currentUserId || !review.sharedWith.includes(targetUserId)) {
                  console.error(`Revoke failed: Review not found, not shared with target, or not owned. Cannot update state.`, { weekKey, targetUserId, currentUserId }); // Replaced logError
                  return state; // Return current state without modification
             }
             const updatedSharedWith = review.sharedWith.filter(id => id !== targetUserId);
             return { ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: updatedSharedWith.length > 0 ? updatedSharedWith : undefined } } };
          });

          // Call the server action
          try {
             await revokeShareApi(weekKey, targetUserId);
              console.log(`Successfully initiated revoke share for review ${weekKey} from ${targetUserId}.`); // Replaced logInfo
          } catch (error) {
             console.error("Failed to revoke share via API:", error); // Replaced logError
             // Rollback the optimistic update
             set((state) => {
                 const review = state.ownedReviews[weekKey];
                 // Check ownership again for safety during rollback
                 if (!review || review.ownerId !== currentUserId) return state;
                 // Restore the original sharedWith array
                 return { ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: originalSharedWith } } };
              });
             throw error; // Re-throw for caller
          }
      },

      searchUserToShareWith: async (email: string): Promise<UserShareInfo | null> => {
           try {
               // Call the server action
               const user = await searchUserByEmailApi(email);
               return user;
           } catch (error) {
               console.error("Error searching for user via API:", error); // Replaced logError
               return null; // Indicate failure
           }
       },

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
       // No custom serializer/deserializer needed if no complex types like Date are directly stored
       deserialize: (str) => {
         const state = JSON.parse(str);
         // Ensure nested objects exist or default to empty
         state.state.ownedReviews = state.state.ownedReviews || {};
         state.state.sharedReviews = state.state.sharedReviews || {};
         state.state.isHydrated = true; // Mark as hydrated
         return state;
       },
    }
  )
);
