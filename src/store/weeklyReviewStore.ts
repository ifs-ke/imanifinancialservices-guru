
// src/store/weeklyReviewStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { encode, decode } from '@/lib/storage-utils';
import type { WeeklyReviewData, UserShareInfo } from '@/lib/types';
import { getISOWeek, getYear } from 'date-fns';
import { shareReviewApi, revokeShareApi, searchUserByEmailApi } from '@/app/actions/shareActions';
// import { useAuth } from '@clerk/nextjs'; // Clerk disabled
import { logWarn } from '@/lib/logger'; // Import logger

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'local-user-wo-clerk';

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
       console.error("Error generating week key:", error);
       return "invalid-week-key";
  }
};

// Helper to get current user ID (mocked when Clerk is disabled)
const getCurrentUserId = (): string | null => {
    return CLERK_DISABLED_PLACEHOLDER_USER_ID;
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
             logWarn(`Security Warning: Attempted client-side journal update for non-owned review.`, { weekKey, ownerId, currentUserId });
             return;
         }
         if (!currentUserId) {
             logWarn("Cannot set journal entry: User not available.");
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
             logWarn("Cannot set transaction comment: User not available.");
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
                 if (ownerId !== currentUserId && !(reviewToUpdate?.sharedWith?.includes(currentUserId))) {
                     logWarn(`Permission Denied: User cannot comment on review.`, { currentUserId, weekKey, ownerId });
                     return state;
                 }
             }

             if (!reviewToUpdate && ownerId === currentUserId) {
                  reviewToUpdate = { ownerId, journal: '', transactionComments: {}, sharedWith: [] };
                  reviewsMapKey = 'ownedReviews';
             } else if (!reviewToUpdate) {
                  console.error(`Cannot set comment: Review not found.`, { weekKey, ownerId });
                  return state;
             }

             const newComments = { ...(reviewToUpdate.transactionComments || {}), [transactionId]: comment };
             if (comment.trim() === '') delete newComments[transactionId];
             const updatedReview = { ...reviewToUpdate, transactionComments: Object.keys(newComments).length > 0 ? newComments : undefined };

             if (reviewsMapKey === 'ownedReviews') return { ownedReviews: { ...state.ownedReviews, [weekKey]: updatedReview } };
             if (reviewsMapKey === 'sharedReviews') return { sharedReviews: { ...state.sharedReviews, [weekKey]: updatedReview } };
             return state;
         });
      },

      deleteTransactionComment: (weekKey, transactionId, ownerId) => {
          const currentUserId = getCurrentUserId();
          if (!currentUserId) {
              logWarn("Cannot delete transaction comment: User not available.");
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
                  if (ownerId !== currentUserId && !(reviewToUpdate?.sharedWith?.includes(currentUserId))) {
                     logWarn(`Permission Denied: User cannot delete comments.`, { currentUserId, weekKey, ownerId });
                     return state;
                 }
             } else {
                 console.error(`Cannot delete comment: Review not found.`, { weekKey, ownerId });
                 return state;
             }

             if (!reviewToUpdate || !reviewToUpdate.transactionComments) return state;
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

           if (ownerId === currentUserId && get().ownedReviews[weekKey]) {
               return get().ownedReviews[weekKey];
           }
           const sharedReview = get().sharedReviews[weekKey];
           if (sharedReview && sharedReview.ownerId === ownerId) {
                if (ownerId === currentUserId || sharedReview.sharedWith?.includes(currentUserId)) {
                    return sharedReview;
                } else {
                    logWarn(`Access Denied: Attempt to access shared review without permission.`, { currentUserId, weekKey, ownerId });
                    return undefined;
                }
           }
           return undefined;
      },

      getTransactionComment: (weekKey, transactionId, ownerId) => {
          const review = get().getReviewForWeek(weekKey, ownerId);
          return review?.transactionComments?.[transactionId];
      },

      clearReviews: () => {
          console.log("Clearing weekly review store state.");
          set({ ...initialState, isHydrated: true });
      },

      shareWeekReview: async (weekKey, targetUserId) => {
          const currentUserId = getCurrentUserId();
          if (!currentUserId) throw new Error("User not available to share.");
          if (currentUserId === targetUserId) throw new Error("Cannot share review with yourself.");

          set((state) => {
             const review = state.ownedReviews[weekKey];
             if (!review || review.ownerId !== currentUserId) {
                  console.error(`Share failed: Review not found or not owned.`, { weekKey, currentUserId });
                 return state;
             }
             const updatedSharedWith = Array.from(new Set([...(review.sharedWith || []), targetUserId])).sort();
             return { ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: updatedSharedWith } } };
          });

          try {
             await shareReviewApi(weekKey, targetUserId); // Server action handles real auth/mock
             console.log(`Successfully initiated share for review ${weekKey} with ${targetUserId}.`);
          } catch (error) {
             console.error("Failed to share review via API:", error);
             set((state) => {
                 const review = state.ownedReviews[weekKey];
                 if (!review || review.ownerId !== currentUserId) return state;
                 const originalSharedWith = (review.sharedWith || []).filter(id => id !== targetUserId);
                 return { ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: originalSharedWith.length > 0 ? originalSharedWith : undefined } } };
             });
             throw error;
          }
      },

      revokeWeekShare: async (weekKey, targetUserId) => {
          const currentUserId = getCurrentUserId();
          if (!currentUserId) throw new Error("User not available to revoke share.");
          const originalSharedWith = get().ownedReviews[weekKey]?.sharedWith;

          set((state) => {
             const review = state.ownedReviews[weekKey];
             if (!review || !review.sharedWith || review.ownerId !== currentUserId) {
                  console.error(`Revoke failed: Review not found, not shared, or not owned.`, { weekKey, currentUserId });
                  return state;
             }
             const updatedSharedWith = review.sharedWith.filter(id => id !== targetUserId);
             return { ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: updatedSharedWith.length > 0 ? updatedSharedWith : undefined } } };
          });

          try {
             await revokeShareApi(weekKey, targetUserId); // Server action handles real auth/mock
              console.log(`Successfully initiated revoke share for review ${weekKey} from ${targetUserId}.`);
          } catch (error) {
             console.error("Failed to revoke share via API:", error);
             set((state) => {
                 const review = state.ownedReviews[weekKey];
                 if (!review || review.ownerId !== currentUserId) return state;
                 return { ownedReviews: { ...state.ownedReviews, [weekKey]: { ...review, sharedWith: originalSharedWith } } };
              });
             throw error;
          }
      },

      searchUserToShareWith: async (email: string): Promise<UserShareInfo | null> => {
           try {
               // Server action handles real auth/mock
               const user = await searchUserByEmailApi(email);
               return user;
           } catch (error) {
               console.error("Error searching for user via API:", error);
               return null;
           }
       },

    }),
    {
      name: 'ifcGuru_weeklyReviews',
      storage: createJSONStorage(() => createSessionStorageWithEncoding()),
      onRehydrateStorage: () => (state) => {
           if (state) {
             state.isHydrated = true;
             console.log("Weekly review store rehydrated.");
           }
       },
       deserialize: (str) => {
         const state = JSON.parse(str);
         state.state.ownedReviews = state.state.ownedReviews || {};
         state.state.sharedReviews = state.state.sharedReviews || {};
         state.state.isHydrated = true;
         return state;
       },
    }
  )
);
