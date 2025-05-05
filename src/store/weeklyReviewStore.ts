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
        // Attempt to decode Base64
        const decodedStr = decode(str);
        return decodedStr;
      } catch (e) {
        console.error(`Failed to decode item "${name}" from sessionStorage. Item might not be Base64 encoded or is corrupted.`, e);
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        // Encode the stringified value using Base64
        const encodedValue = encode(value);
        storage.setItem(name, encodedValue);
      } catch (e) {
         console.error(`Failed to encode and set item "${name}" for sessionStorage`, e);
      }
    },
    removeItem: (name) => storage.removeItem(name),
  };
};

// Define the state shape
interface WeeklyReviewState {
  ownedReviews: Record<string, WeeklyReviewData>; // key: 'YYYY-WW' (Owned by current user)
  sharedReviews: Record<string, WeeklyReviewData>; // key: 'YYYY-WW' (Shared with current user)
  isHydrated: boolean; // Flag for hydration status
  setOwnedReviews: (reviews: Record<string, WeeklyReviewData>) => void;
  setSharedReviews: (reviews: Record<string, WeeklyReviewData>) => void;
  setJournalEntry: (weekKey: string, journal: string, ownerId: string) => void;
  setTransactionComment: (weekKey: string, transactionId: string, comment: string, ownerId: string) => void;
  deleteTransactionComment: (weekKey: string, transactionId: string, ownerId: string) => void;
  getReviewForWeek: (weekKey: string, ownerId: string) => WeeklyReviewData | undefined;
  getTransactionComment: (weekKey: string, transactionId: string, ownerId: string) => string | undefined;
  clearReviews: () => void; // Action to clear local state
  shareWeekReview: (weekKey: string, targetUserId: string) => Promise<void>; // Action to share via API
  revokeWeekShare: (weekKey: string, targetUserId: string) => Promise<void>; // Action to revoke via API
  searchUserToShareWith: (email: string) => Promise<UserShareInfo | null>; // Action to search user via API
}

// Define the initial state
const initialState = {
    ownedReviews: {},
    sharedReviews: {},
    isHydrated: false,
};

// Helper function to generate the week key (YYYY-WW)
export const getWeekKey = (date: Date): string => {
  try {
      const year = getYear(date);
      const weekNumber = getISOWeek(date);
      // Validate week number (should be between 1 and 53)
      if (weekNumber < 1 || weekNumber > 53) {
          throw new Error(`Invalid week number ${weekNumber} calculated for date ${date}`);
      }
      return `${year}-${weekNumber.toString().padStart(2, '0')}`;
  } catch (error) {
       console.error("Error generating week key:", error);
       // Return a fallback or throw, depending on desired strictness
       return "invalid-week-key";
  }
};


// Helper to get current user ID (encapsulated)
// This is a CLIENT-SIDE helper. Server actions should use auth() directly.
const getCurrentUserId = (): string | null => {
    // This relies on Clerk being loaded client-side.
    try {
      // Access Clerk state directly if possible, ensure it's loaded.
      const clerkState = useAuth.getState();
      if (!clerkState.isLoaded) {
          console.warn("getCurrentUserId: Clerk not loaded yet.");
          return null; // Clerk state not available yet
      }
      return clerkState.userId;
    } catch (e) {
        // This might happen if called outside React component context initially.
        console.warn("useAuth.getState() failed in getCurrentUserId, likely called outside component context.");
        return null;
    }
};


export const useWeeklyReviewStore = create<WeeklyReviewState>()(
  persist(
    (set, get) => ({
      ...initialState,

       // Setter for initializing/overwriting owned reviews (e.g., from sync)
      setOwnedReviews: (reviews) => {
          // Basic validation: Ensure it's an object
          const validatedReviews = (typeof reviews === 'object' && reviews !== null) ? reviews : {};
          set({ ownedReviews: validatedReviews, isHydrated: true });
      },
       // Setter for initializing/overwriting shared reviews (e.g., from sync)
      setSharedReviews: (reviews) => {
          // Basic validation: Ensure it's an object
           const validatedReviews = (typeof reviews === 'object' && reviews !== null) ? reviews : {};
          set({ sharedReviews: validatedReviews, isHydrated: true });
      },

       // Set or update the journal entry for a specific week owned by the current user
      setJournalEntry: (weekKey, journal, ownerId) => {
         const currentUserId = getCurrentUserId();
          // Security Check: Only allow owner to modify their journal client-side
         if (ownerId !== currentUserId) {
             console.warn(`Security Warning: Attempted client-side journal update for week ${weekKey} by non-owner (${currentUserId}). Operation blocked.`);
             // Optionally throw an error or show a toast
             // throw new Error("Permission denied: Cannot update journal for non-owned review.");
             return;
         }
         if (!currentUserId) {
             console.warn("Cannot set journal entry: User not authenticated.");
             return;
         }
        set((state) => {
             const currentReview = state.ownedReviews[weekKey] || { ownerId: currentUserId, journal: '', transactionComments: {}, sharedWith: [] };
             // Ensure ownerId matches (redundant check due to above, but safe)
             if (currentReview.ownerId !== currentUserId) return state;
             return {
                 ownedReviews: {
                     ...state.ownedReviews,
                     [weekKey]: { ...currentReview, journal: journal },
                 },
             };
         });
      },

      // Set or update a comment for a specific transaction within a week's review
      // Handles both owned and shared reviews (comments can be added by collaborators)
      setTransactionComment: (weekKey, transactionId, comment, ownerId) => {
         const currentUserId = getCurrentUserId();
         if (!currentUserId) {
             console.warn("Cannot set transaction comment: User not authenticated.");
             return;
         }
         set((state) => {
             let reviewToUpdate: WeeklyReviewData | undefined;
             let reviewsMapKey: 'ownedReviews' | 'sharedReviews' | null = null;

             // Determine if we are updating an owned review or a shared review
             if (state.ownedReviews[weekKey]?.ownerId === ownerId) {
                 reviewToUpdate = state.ownedReviews[weekKey];
                 reviewsMapKey = 'ownedReviews';
             } else if (state.sharedReviews[weekKey]?.ownerId === ownerId) {
                 reviewToUpdate = state.sharedReviews[weekKey];
                 reviewsMapKey = 'sharedReviews';
                 // Permission Check: Ensure current user is either the owner or in the sharedWith list
                 if (ownerId !== currentUserId && !(reviewToUpdate?.sharedWith?.includes(currentUserId))) {
                     console.warn(`Permission Denied: User ${currentUserId} cannot comment on review ${weekKey} owned by ${ownerId}.`);
                     return state; // Prevent update
                 }
             }

             // If review doesn't exist in either map, create a new entry if owner is current user
             if (!reviewToUpdate && ownerId === currentUserId) {
                  console.log(`Creating new owned review entry for ${weekKey} to add comment.`);
                  reviewToUpdate = { ownerId, journal: '', transactionComments: {}, sharedWith: [] };
                  reviewsMapKey = 'ownedReviews';
             } else if (!reviewToUpdate) {
                  console.error(`Cannot set comment: Review for week ${weekKey} with owner ${ownerId} not found.`);
                  return state; // No change if review not found and not owner
             }


             // Update the comments
             const newComments = { ...(reviewToUpdate.transactionComments || {}), [transactionId]: comment };
             if (comment.trim() === '') {
                 delete newComments[transactionId]; // Remove comment if empty
             }

             const updatedReview = {
                 ...reviewToUpdate,
                 transactionComments: Object.keys(newComments).length > 0 ? newComments : undefined, // Store undefined if no comments
             };

             // Update the correct map (owned or shared)
             if (reviewsMapKey === 'ownedReviews') {
                 return { ownedReviews: { ...state.ownedReviews, [weekKey]: updatedReview } };
             } else if (reviewsMapKey === 'sharedReviews') {
                 return { sharedReviews: { ...state.sharedReviews, [weekKey]: updatedReview } };
             }

             return state; // Should not be reached if logic is correct
         });
      },

      // Delete a comment for a specific transaction within a week's review
       deleteTransactionComment: (weekKey, transactionId, ownerId) => {
          const currentUserId = getCurrentUserId();
          if (!currentUserId) {
              console.warn("Cannot delete transaction comment: User not authenticated.");
              return;
          }
         set((state) => {
             let reviewsMapKey: 'ownedReviews' | 'sharedReviews' | null = null;
             let reviewToUpdate: WeeklyReviewData | undefined;

             // Determine if operating on owned or shared review
            if (state.ownedReviews[weekKey]?.ownerId === ownerId) {
                 reviewToUpdate = state.ownedReviews[weekKey];
                 reviewsMapKey = 'ownedReviews';
                 // Security: Owner can always delete comments on their own review
             } else if (state.sharedReviews[weekKey]?.ownerId === ownerId) {
                 reviewToUpdate = state.sharedReviews[weekKey];
                 reviewsMapKey = 'sharedReviews';
                 // Permission Check: Only owner or potentially the comment author (if tracked) should delete.
                 // Current implementation: Only allow owner or collaborator listed in sharedWith.
                  if (ownerId !== currentUserId && !(reviewToUpdate?.sharedWith?.includes(currentUserId))) {
                     console.warn(`Permission Denied: User ${currentUserId} cannot delete comments on review ${weekKey} owned by ${ownerId}.`);
                     return state; // Prevent deletion
                 }
             } else {
                 console.error(`Cannot delete comment: Review for week ${weekKey} with owner ${ownerId} not found.`);
                 return state; // No change if review not found
             }


             if (!reviewToUpdate || !reviewToUpdate.transactionComments) {
                 console.log("No comments to delete.");
                 return state; // No comments exist
             }

             const newComments = { ...reviewToUpdate.transactionComments };
             delete newComments[transactionId]; // Delete the specific comment

             const updatedReview = {
                 ...reviewToUpdate,
                 transactionComments: Object.keys(newComments).length > 0 ? newComments : undefined, // Store undefined if no comments left
             };

             // Update the correct map
             if (reviewsMapKey === 'ownedReviews') {
                 return { ownedReviews: { ...state.ownedReviews, [weekKey]: updatedReview } };
             } else if (reviewsMapKey === 'sharedReviews') {
                 return { sharedReviews: { ...state.sharedReviews, [weekKey]: updatedReview } };
             }
             return state;
         });
      },

      // Get review data for a specific week, checking both owned and shared reviews
      getReviewForWeek: (weekKey, ownerId) => {
           const currentUserId = getCurrentUserId();
           if (!currentUserId) return undefined; // Not authenticated

           // Check owned reviews first
           if (ownerId === currentUserId && get().ownedReviews[weekKey]) {
               return get().ownedReviews[weekKey];
           }
           // Check shared reviews, ensuring the ownerId matches
           const sharedReview = get().sharedReviews[weekKey];
           if (sharedReview && sharedReview.ownerId === ownerId) {
                // Verify the current user is actually in the sharedWith list (or is the owner)
                if (ownerId === currentUserId || sharedReview.sharedWith?.includes(currentUserId)) {
                    return sharedReview;
                } else {
                    console.warn(`Access Denied: User ${currentUserId} is trying to access shared review ${weekKey} owned by ${ownerId}, but is not in the sharedWith list.`);
                    return undefined;
                }
           }
           return undefined; // Not found in either owned or accessible shared reviews
      },

      // Get a specific transaction comment
      getTransactionComment: (weekKey, transactionId, ownerId) => {
          const review = get().getReviewForWeek(weekKey, ownerId); // Use the unified getter
          return review?.transactionComments?.[transactionId];
      },

       // Clear all review data (used on logout/user change)
      clearReviews: () => {
          console.log("Clearing weekly review store state.");
          set({ ...initialState, isHydrated: true }); // Reset state but keep hydrated flag true
      },

      // Share a weekly review with another user (calls server action)
      shareWeekReview: async (weekKey, targetUserId) => {
          const currentUserId = getCurrentUserId();
          if (!currentUserId) throw new Error("User not authenticated to share.");
          if (currentUserId === targetUserId) throw new Error("Cannot share review with yourself.");

          // Optimistic UI update: Add targetUserId to sharedWith in the owned review
          set((state) => {
             const review = state.ownedReviews[weekKey];
             // Ensure the review exists and is owned by the current user
             if (!review || review.ownerId !== currentUserId) {
                  console.error(`Share failed: Review ${weekKey} not found or not owned by ${currentUserId}.`);
                  // Optionally throw an error here if preferred over just returning state
                  // throw new Error(`Review ${weekKey} not found or not owned by current user.`);
                 return state; // No change if review not found or not owned
             }
             // Use Set to avoid duplicates, then sort for consistency
             const updatedSharedWith = Array.from(new Set([...(review.sharedWith || []), targetUserId])).sort();
             return {
                 ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: updatedSharedWith } },
             };
          });

          try {
             // Call the server action to persist the share
             await shareReviewApi(weekKey, targetUserId);
             console.log(`Successfully shared review ${weekKey} with ${targetUserId} via API.`);
          } catch (error) {
             console.error("Failed to share review via API:", error);
             // Rollback optimistic update on failure
             set((state) => {
                 const review = state.ownedReviews[weekKey];
                  // Check ownership again for safety during rollback
                 if (!review || review.ownerId !== currentUserId) return state;
                 // Remove the targetUserId that was optimistically added
                 const originalSharedWith = (review.sharedWith || []).filter(id => id !== targetUserId);
                 return {
                     ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: originalSharedWith.length > 0 ? originalSharedWith : undefined } },
                 };
             });
             throw error; // Re-throw the error so the UI can handle it (e.g., show toast)
          }
      },

      // Revoke sharing access for a user (calls server action)
      revokeWeekShare: async (weekKey, targetUserId) => {
          const currentUserId = getCurrentUserId();
          if (!currentUserId) throw new Error("User not authenticated to revoke share.");
          const originalSharedWith = get().ownedReviews[weekKey]?.sharedWith; // Store original before optimistic update

          // Optimistic UI update: Remove targetUserId from sharedWith
          set((state) => {
             const review = state.ownedReviews[weekKey];
             // Ensure review exists, has sharedWith list, and is owned by current user
             if (!review || !review.sharedWith || review.ownerId !== currentUserId) {
                  console.error(`Revoke failed: Review ${weekKey} not found, not shared, or not owned by ${currentUserId}.`);
                  // throw new Error(`Review ${weekKey} not found, not shared, or not owned by current user.`);
                  return state;
             }
             const updatedSharedWith = review.sharedWith.filter(id => id !== targetUserId);
             return {
                 ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: updatedSharedWith.length > 0 ? updatedSharedWith : undefined } },
             };
          });

          try {
             // Call the server action to persist the revocation
             await revokeShareApi(weekKey, targetUserId);
              console.log(`Successfully revoked share for review ${weekKey} from ${targetUserId} via API.`);
          } catch (error) {
             console.error("Failed to revoke share via API:", error);
             // Rollback optimistic update on failure
             set((state) => {
                 const review = state.ownedReviews[weekKey];
                  // Check ownership again
                 if (!review || review.ownerId !== currentUserId) return state;
                 // Restore the original sharedWith list
                 return {
                     ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: originalSharedWith } },
                 };
              });
             throw error; // Re-throw error for UI handling
          }
      },

      // Search for a user by email to share with (calls server action)
      searchUserToShareWith: async (email: string): Promise<UserShareInfo | null> => {
           try {
               // Call the server action which handles authentication check internally
               const user = await searchUserByEmailApi(email);
               return user;
           } catch (error) {
               console.error("Error searching for user via API:", error);
               // Don't throw here, let the UI handle null response
               return null;
           }
       },

    }),
    {
      name: 'ifcGuru_weeklyReviews', // Name for persisted data
      storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use session storage with Base64
      onRehydrateStorage: () => (state) => {
           if (state) {
             state.isHydrated = true;
             console.log("Weekly review store rehydrated.");
           }
       },
       // No special serialization needed for this structure (no Date objects)
       deserialize: (str) => {
         const state = JSON.parse(str);
         // Ensure maps exist on hydration and mark as hydrated
         state.state.ownedReviews = state.state.ownedReviews || {};
         state.state.sharedReviews = state.state.sharedReviews || {};
         state.state.isHydrated = true;
         return state;
       },
      // GDPR/Security Note: Same session storage limitations apply.
      // Base64 is not encryption. Sensitive journal entries/comments are stored obfuscated, not encrypted, client-side.
      // `clearReviews` is crucial. Server-side authorization in share/revoke actions is vital.
    }
  )
);
