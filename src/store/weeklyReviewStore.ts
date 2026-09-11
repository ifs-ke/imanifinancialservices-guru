// src/store/weeklyReviewStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { encode, decode } from '@/lib/storage-utils';
import type { WeeklyReviewData, CollaboratorComment } from '@/lib/types';
import { getISOWeek, getYear } from 'date-fns';
import { logError, logInfo, logWarn } from '@/lib/logger';

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
        return null;
      }
    },
    setItem: (name, value) => {
      if (!storage) return;
      try {
        const stringifiedValue = JSON.stringify(value);
        const encodedValue = encode(stringifiedValue);
        storage.setItem(name, encodedValue);
      } catch (e) {}
    },
    removeItem: (name) => storage?.removeItem(name),
  };
};

export interface WeeklyReviewState {
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  isHydrated: boolean;
  setReviews: (
    ownedReviews: Record<string, WeeklyReviewData>,
    sharedReviews?: Record<string, WeeklyReviewData>
  ) => void;
  setOwnedReviews: (reviews: Record<string, WeeklyReviewData>) => void;
  setSharedReviews: (reviews: Record<string, WeeklyReviewData>) => void;
  setJournalEntry: (weekKey: string, journal: string, ownerId: string) => void;
  setTransactionComment: (weekKey: string, transactionId: string, comment: string, ownerId: string) => void;
  addCollaboratorComment: (weekKey: string, transactionId: string, comment: CollaboratorComment, targetStore: 'owned' | 'shared') => void;
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
      logWarn(`Invalid week number ${weekNumber} calculated for date ${date}. Defaulting to year-01.`);
      return `${year}-01`;
    }
    return `${year}-${weekNumber.toString().padStart(2, '0')}`;
  } catch (error) {
    logError('Error generating week key:', error);
    return 'invalid-week-key';
  }
};

export const useWeeklyReviewStore = create<WeeklyReviewState>()(
  persist(
    (set, get) => ({
      ...initialState,
      setReviews: (ownedReviews, sharedReviews = {}) => {
        const validatedOwned = typeof ownedReviews === 'object' && ownedReviews !== null ? ownedReviews : {};
        const validatedShared = typeof sharedReviews === 'object' && sharedReviews !== null ? sharedReviews : {};
        set({
          ownedReviews: validatedOwned,
          sharedReviews: validatedShared,
          isHydrated: true,
        });
        logInfo('WeeklyReviewStore: Reviews updated from sync/hydration.');
      },
      setOwnedReviews: (reviews) => {
        const validatedReviews = typeof reviews === 'object' && reviews !== null ? reviews : {};
        set({ ownedReviews: validatedReviews, isHydrated: true });
      },
      setSharedReviews: (reviews) => {
        const validatedReviews = typeof reviews === 'object' && reviews !== null ? reviews : {};
        set({ sharedReviews: validatedReviews, isHydrated: true });
      },
      setJournalEntry: (weekKey, journal, ownerId) => {
        set((state) => {
          const currentReview = state.ownedReviews[weekKey] || {
            ownerId: ownerId,
            journal: '',
            transactionComments: {},
            sharedWith: [],
          };
          if (currentReview.ownerId !== ownerId) {
            logWarn(`Attempted to set journal for review not owned by ${ownerId}.`);
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

          if (!reviewToUpdate) {
            const newReviewShell = {
              ownerId,
              journal: '',
              transactionComments: { [transactionId]: comment },
              sharedWith: [],
            };
            return { ownedReviews: { ...state.ownedReviews, [weekKey]: newReviewShell } };
          }

          if (reviewToUpdate.ownerId !== ownerId) {
            logWarn(`Attempted to set comment for review not owned by ${ownerId}.`);
            return state;
          }

          const newComments = { ...(reviewToUpdate.transactionComments || {}), [transactionId]: comment };
          if (comment.trim() === '') delete newComments[transactionId];
          const updatedReview = {
            ...reviewToUpdate,
            ownerId,
            transactionComments: Object.keys(newComments).length > 0 ? newComments : undefined,
          };
          return { ownedReviews: { ...state.ownedReviews, [weekKey]: updatedReview } };
        });
      },
      addCollaboratorComment: (weekKey, transactionId, comment, targetStore) => {
        set((state) => {
          const storeKey = targetStore === 'owned' ? 'ownedReviews' : 'sharedReviews';
          const targetRecord = state[storeKey][weekKey] || {
            ownerId: comment.role === 'owner' ? comment.authorId : 'shared_owner',
            journal: '',
            transactionComments: {},
            collaboratorComments: {},
            sharedWith: [],
          };

          const existingCollaboratorComments = { ...(targetRecord.collaboratorComments || {}) };
          const list = existingCollaboratorComments[transactionId] ? [...existingCollaboratorComments[transactionId]] : [];
          list.push(comment);
          existingCollaboratorComments[transactionId] = list;

          const existingTransactionComments = { ...(targetRecord.transactionComments || {}) };
          existingTransactionComments[transactionId] = comment.comment;

          const updatedReview = {
            ...targetRecord,
            collaboratorComments: existingCollaboratorComments,
            transactionComments: existingTransactionComments,
          };

          return {
            [storeKey]: { ...state[storeKey], [weekKey]: updatedReview },
          };
        });
      },
      deleteTransactionComment: (weekKey, transactionId, ownerId) => {
        set((state) => {
          const reviewToUpdate = state.ownedReviews[weekKey];
          if (!reviewToUpdate || reviewToUpdate.ownerId !== ownerId || !reviewToUpdate.transactionComments) {
            logWarn(`Attempted to delete comment for review not found, not owned, or without comments.`);
            return state;
          }
          const newComments = { ...reviewToUpdate.transactionComments };
          delete newComments[transactionId];
          const updatedReview = {
            ...reviewToUpdate,
            ownerId,
            transactionComments: Object.keys(newComments).length > 0 ? newComments : undefined,
          };
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
            logWarn(`Access Denied: Attempt to access shared review without permission.`, {
              weekKey,
              ownerId,
              currentUserId,
            });
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
        logInfo('WeeklyReviewStore: Clearing owned and shared reviews state.');
        set({ ...initialState, isHydrated: true });
      },
    }),
    {
      name: 'ifcGuru_weeklyReviews',
      storage: createJSONStorage(createSessionStorageWithEncoding),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isHydrated = true;
          if (!state.ownedReviews || typeof state.ownedReviews !== 'object') {
            state.ownedReviews = {};
          }
          if (!state.sharedReviews || typeof state.sharedReviews !== 'object') {
            state.sharedReviews = {};
          }
          logInfo('WeeklyReviewStore: Rehydrated successfully.');
        }
      },
    }
  )
);
