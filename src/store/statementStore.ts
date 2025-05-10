// src/store/statementStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { StatementItem, OtherLiabilityItem } from '@/lib/types';
import { startOfMonth, endOfMonth } from 'date-fns';
import { encode, decode } from '@/lib/storage-utils'; 
import { logInfo } from '@/lib/logger'; // Import logger

const generateId = (prefix: 'asset' | 'lia'): string => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const sortItems = <T extends { description: string }>(items: T[]): T[] => {
    if (!Array.isArray(items)) return [];
    return [...items].sort((a, b) => (a.description || '').localeCompare(b.description || ''));
};

const defaultEndDate = endOfMonth(new Date());
const defaultStartDate = startOfMonth(defaultEndDate);

const createSessionStorageWithEncoding = (): StateStorage => {
  const storage = typeof window !== 'undefined' ? sessionStorage : undefined;
  return {
    getItem: (name) => {
      if (!storage) return null;
      const str = storage.getItem(name);
      if (!str) return null;
      try {
        const decodedStr = decode(str);
        // Deserialize Date objects
        return JSON.parse(decodedStr, (key, value) => {
            if ((key === 'startDate' || key === 'endDate') && typeof value === 'string') {
                const parsedDate = new Date(value);
                return !isNaN(parsedDate.getTime()) ? parsedDate : undefined;
            }
            return value;
        });
      } catch (e) {
        // console.error(`Failed to decode/parse item "${name}" from sessionStorage.`, e); 
        return null;
      }
    },
    setItem: (name, value) => {
      if (!storage) return;
      try {
        // Serialize Date objects to ISO strings
        const stringifiedValue = JSON.stringify(value, (key, val) => {
            if ((key === 'startDate' || key === 'endDate') && val instanceof Date) {
                return val.toISOString();
            }
            return val;
        });
        const encodedValue = encode(stringifiedValue);
        storage.setItem(name, encodedValue);
      } catch (e) {
        // console.error(`Failed to encode/stringify and set item "${name}" for sessionStorage`, e); 
      }
    },
    removeItem: (name) => storage?.removeItem(name),
  };
};

export interface StatementState {
    assetItems: StatementItem[];
    otherLiabilityItems: OtherLiabilityItem[];
    startDate: Date | undefined;
    endDate: Date | undefined;
    isHydrated: boolean; 
    setStartDate: (date: Date | undefined) => void;
    setEndDate: (date: Date | undefined) => void;
    setAssetItems: (items: StatementItem[]) => void;
    setOtherLiabilityItems: (items: OtherLiabilityItem[]) => void;
    addAssetItem: (itemData: Omit<StatementItem, 'id'>) => void;
    addOtherLiabilityItem: (itemData: Omit<OtherLiabilityItem, 'id'>) => void;
    updateAssetItem: (updatedItem: StatementItem) => void;
    updateOtherLiabilityItem: (updatedItem: OtherLiabilityItem) => void;
    deleteAssetItem: (id: string) => void;
    deleteOtherLiabilityItem: (id: string) => void;
    clearStatementItems: () => void; 
}

const initialState = {
    assetItems: [],
    otherLiabilityItems: [],
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    isHydrated: false,
};

export const useStatementStore = create<StatementState>()(
    persist(
        (set, get) => ({
            ...initialState,
            setStartDate: (date) => set({ startDate: date }),
            setEndDate: (date) => set({ endDate: date }),
            setAssetItems: (items) => set({ assetItems: sortItems(items || []), isHydrated: true }),
            setOtherLiabilityItems: (items) => set({ otherLiabilityItems: sortItems(items || []), isHydrated: true }),
            addAssetItem: (itemData) => {
                const newItem: StatementItem = { id: generateId('asset'), ...itemData };
                set((state) => ({ assetItems: sortItems([...state.assetItems, newItem]) }));
            },
            addOtherLiabilityItem: (itemData) => {
                const newItem: OtherLiabilityItem = { id: generateId('lia'), ...itemData };
                set((state) => ({ otherLiabilityItems: sortItems([...state.otherLiabilityItems, newItem]) }));
            },
            updateAssetItem: (updatedItem) => {
                set((state) => ({
                    assetItems: sortItems(state.assetItems.map(item => item.id === updatedItem.id ? updatedItem : item))
                }));
            },
            updateOtherLiabilityItem: (updatedItem) => {
                 set((state) => ({
                     otherLiabilityItems: sortItems(state.otherLiabilityItems.map(item => item.id === updatedItem.id ? updatedItem : item))
                 }));
            },
            deleteAssetItem: (id) => {
                set((state) => ({ assetItems: sortItems(state.assetItems.filter(item => item.id !== id)) }));
            },
            deleteOtherLiabilityItem: (id) => {
                set((state) => ({ otherLiabilityItems: sortItems(state.otherLiabilityItems.filter(item => item.id !== id)) }));
            },
            clearStatementItems: () => {
                 logInfo("StatementStore: Clearing statement items and dates state.");
                 set({ ...initialState, isHydrated: true }); 
             },
        }),
        {
            name: 'ifcGuru_statementItems', 
            storage: createJSONStorage(createSessionStorageWithEncoding), 
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                   if (!(state.startDate instanceof Date) || isNaN(state.startDate.getTime())) {
                       state.startDate = defaultStartDate;
                   }
                   if (!(state.endDate instanceof Date) || isNaN(state.endDate.getTime())) {
                       state.endDate = defaultEndDate;
                   }
                   logInfo("StatementStore: Rehydrated successfully.");
                 }
             },
        }
    )
);

export const selectTotalAssets = (state: StatementState): number =>
    state.assetItems.reduce((sum, item) => sum + (item.amount || 0), 0);

export const selectTotalOtherLiabilities = (state: StatementState): number =>
    state.otherLiabilityItems.reduce((sum, item) => sum + (item.amount || 0), 0);

export const selectStartDate = (state: StatementState): Date | undefined => state.startDate;

export const selectEndDate = (state: StatementState): Date | undefined => state.endDate;
```