
// src/store/investmentStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { InvestmentItem } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils';
import { logInfo, logDebug } from '@/lib/logger';
import { format, isValid as isDateValid } from 'date-fns';

const generateId = (): string => {
  const prefix = 'invest';
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  } else {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
};

const sortInvestmentItems = (items: InvestmentItem[]): InvestmentItem[] => {
    if (!Array.isArray(items)) return [];
    return [...items].sort((a, b) => {
        const nameDiff = (a.name || '').localeCompare(b.name || '');
        if (nameDiff !== 0) return nameDiff;
        const dateA = a.purchaseDate instanceof Date ? a.purchaseDate : new Date(a.purchaseDate || 0);
        const dateB = b.purchaseDate instanceof Date ? b.purchaseDate : new Date(b.purchaseDate || 0);
        const timeA = !isNaN(dateA.getTime()) ? dateA.getTime() : 0;
        const timeB = !isNaN(dateB.getTime()) ? dateB.getTime() : 0;
        return timeA - timeB;
    });
};

const createSessionStorageWithEncoding = (): StateStorage => {
  const storage = typeof window !== 'undefined' ? sessionStorage : undefined;
  return {
    getItem: (name) => {
      if (!storage) return null;
      const str = storage.getItem(name);
      if (!str) return null;
      try {
        const decodedStr = decode(str);
        return JSON.parse(decodedStr, (key, value) => {
            if (key === 'purchaseDate' && typeof value === 'string') {
                const parsedDate = new Date(value);
                return !isNaN(parsedDate.getTime()) ? parsedDate : new Date(0);
            }
            return value;
        });
      } catch (e) {
        logDebug(`Failed to decode/parse item "${name}" from sessionStorage.`, { error: e });
        return null;
      }
    },
    setItem: (name, value) => {
      if (!storage) return;
      try {
        const stringifiedValue = JSON.stringify(value, (key, val) => {
            if (key === 'purchaseDate' && val instanceof Date) {
                return val.toISOString();
            }
            return val;
        });
        const encodedValue = encode(stringifiedValue);
        storage.setItem(name, encodedValue);
      } catch (e) {
        logDebug(`Failed to encode/stringify and set item "${name}" for sessionStorage`, { error: e });
      }
    },
    removeItem: (name) => storage?.removeItem(name),
  };
};

export interface InvestmentState {
    investmentItems: InvestmentItem[];
    isHydrated: boolean;
    setInvestmentItems: (items: InvestmentItem[]) => void;
    addInvestmentItem: (itemData: Omit<InvestmentItem, 'id'>) => InvestmentItem;
    updateInvestmentItem: (updatedItem: InvestmentItem) => void;
    deleteInvestmentItem: (id: string) => void;
    clearInvestmentItems: () => void;
}

const initialState = {
    investmentItems: [],
    isHydrated: false,
};

export const useInvestmentStore = create<InvestmentState>()(
    persist(
        (set, get) => ({
            ...initialState,
            setInvestmentItems: (items) => {
                 const validatedItems = (items || []).map(item => ({
                     ...item,
                     purchaseDate: item.purchaseDate instanceof Date && !isNaN(item.purchaseDate.getTime()) ? item.purchaseDate : new Date(0),
                     currency: item.currency || 'KES', // Default currency
                 }));
                 set({ investmentItems: sortInvestmentItems(validatedItems), isHydrated: true });
            },
            addInvestmentItem: (itemData) => {
                const newItem: InvestmentItem = {
                    id: generateId(),
                    ...itemData,
                    purchaseDate: itemData.purchaseDate instanceof Date && !isNaN(itemData.purchaseDate.getTime()) ? itemData.purchaseDate : new Date(0),
                    currency: itemData.currency || 'KES',
                };
                set((state) => ({ investmentItems: sortInvestmentItems([...state.investmentItems, newItem]) }));
                return newItem;
            },
            updateInvestmentItem: (updatedItem) => {
                 const validatedDate = updatedItem.purchaseDate instanceof Date && !isNaN(updatedItem.purchaseDate.getTime())
                     ? updatedItem.purchaseDate
                     : new Date(0);
                set((state) => ({
                    investmentItems: sortInvestmentItems(
                        state.investmentItems.map(item => item.id === updatedItem.id ? { ...updatedItem, purchaseDate: validatedDate, currency: updatedItem.currency || 'KES' } : item)
                    )
                }));
            },
            deleteInvestmentItem: (id) => {
                set((state) => ({
                    investmentItems: sortInvestmentItems(state.investmentItems.filter(item => item.id !== id)),
                }));
            },
            clearInvestmentItems: () => {
                logInfo("InvestmentStore: Clearing investment items state.");
                set({ ...initialState, isHydrated: true });
            },
        }),
        {
            name: 'ifcGuru_investmentItems_v2', // Version updated due to potential schema changes/defaults
            storage: createJSONStorage(createSessionStorageWithEncoding),
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                   logInfo("InvestmentStore: Rehydrated successfully (v2).");
                 }
             },
        }
    )
);

export const selectTotalInvestmentsValue = (state: InvestmentState): number =>
    state.investmentItems.reduce((sum, item) => sum + (item.currentValue || 0), 0);

export const selectInvestmentTypes = (state: InvestmentState): string[] =>
    Array.from(new Set(state.investmentItems.map(item => item.type).filter(type => !!type))) as string[];
