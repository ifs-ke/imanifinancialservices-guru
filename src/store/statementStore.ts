// src/store/statementStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { StatementItem, OtherLiabilityItem } from '@/lib/types';
import { startOfMonth, endOfMonth } from 'date-fns';
import { encode, decode } from '@/lib/storage-utils'; // Import encoding/decoding utils

// Generate unique IDs
const generateId = (prefix: 'asset' | 'lia'): string => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to sort items alphabetically by description - IMPORTANT for consistent hashing
const sortItems = <T extends { description: string }>(items: T[]): T[] => {
    return [...items].sort((a, b) => a.description.localeCompare(b.description));
};

// Define default date range
const defaultEndDate = endOfMonth(new Date());
const defaultStartDate = startOfMonth(defaultEndDate);

// Custom Session Storage with Base64 encoding
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
        console.error(`Failed to decode item "${name}" from sessionStorage`, e);
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        const encodedValue = encode(value);
        storage.setItem(name, encodedValue);
      } catch (e) {
         console.error(`Failed to encode item "${name}" for sessionStorage`, e);
      }
    },
    removeItem: (name) => storage.removeItem(name),
  };
};

interface StatementState {
    assetItems: StatementItem[];
    otherLiabilityItems: OtherLiabilityItem[];
    startDate: Date | undefined;
    endDate: Date | undefined;
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
};

export const useStatementStore = create<StatementState>()(
    persist(
        (set, get) => ({
            ...initialState,
            setStartDate: (date) => set({ startDate: date }),
            setEndDate: (date) => set({ endDate: date }),
            setAssetItems: (items) => set({ assetItems: sortItems(items || []) }),
            setOtherLiabilityItems: (items) => set({ otherLiabilityItems: sortItems(items || []) }),
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
            clearStatementItems: () => set({ // Resets items AND dates to defaults
                 assetItems: [],
                 otherLiabilityItems: [],
                 startDate: defaultStartDate,
                 endDate: defaultEndDate,
             }),
        }),
        {
            name: 'ifcGuru_statementItems',
            storage: createJSONStorage(() => createSessionStorageWithEncoding()),
             // Use reviver/replacer for Date objects
             serialize: (state) => {
                 const replacer = (key: string, value: any) => {
                   if (value instanceof Date) {
                     // Store dates as ISO strings
                     return { __type: 'Date', value: value.toISOString() };
                   }
                   return value;
                 };
                 // Deep clone and apply replacer to ensure nested dates are handled
                 const stateToSave = JSON.parse(JSON.stringify(state.state, replacer));
                 return JSON.stringify({ ...state, state: stateToSave });
            },
            deserialize: (str) => {
               const state = JSON.parse(str);
               const reviver = (key: string, value: any) => {
                 if (value && typeof value === 'object' && value.__type === 'Date') {
                   // Convert ISO string back to Date object
                   return new Date(value.value);
                 }
                 // Handle potential string dates during migration/manual edits (optional but safer)
                 if ((key === 'startDate' || key === 'endDate') && typeof value === 'string') {
                     try {
                         const parsedDate = new Date(value);
                         if (!isNaN(parsedDate.getTime())) return parsedDate;
                     } catch (e) {}
                 }
                 return value;
               };
               // Apply reviver during parsing
               const parsedState = JSON.parse(JSON.stringify(state.state), reviver);
               // Sort items after reviving
               parsedState.assetItems = sortItems(parsedState.assetItems || []);
               parsedState.otherLiabilityItems = sortItems(parsedState.otherLiabilityItems || []);
               // Set default dates if parsing failed or dates are invalid
               parsedState.startDate = parsedState.startDate instanceof Date && !isNaN(parsedState.startDate.getTime()) ? parsedState.startDate : defaultStartDate;
               parsedState.endDate = parsedState.endDate instanceof Date && !isNaN(parsedState.endDate.getTime()) ? parsedState.endDate : defaultEndDate;
               return { ...state, state: parsedState };
           },
        }
    )
);

// Selectors remain the same
export const selectTotalAssets = (state: StatementState): number =>
    state.assetItems.reduce((sum, item) => sum + item.amount, 0);

export const selectTotalOtherLiabilities = (state: StatementState): number =>
    state.otherLiabilityItems.reduce((sum, item) => sum + item.amount, 0);

export const selectStartDate = (state: StatementState): Date | undefined => state.startDate;
export const selectEndDate = (state: StatementState): Date | undefined => state.endDate;
