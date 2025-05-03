// src/store/statementStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { StatementItem, OtherLiabilityItem } from '@/lib/types';
import { startOfMonth, endOfMonth } from 'date-fns';
import { encode, decode } from '@/lib/storage-utils'; // Import encoding/decoding utils

// Generate unique IDs
const generateId = (prefix: 'asset' | 'lia'): string => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to sort items alphabetically by description
const sortItems = <T extends { description: string }>(items: T[]): T[] => {
    return [...items].sort((a, b) => a.description.localeCompare(b.description));
};

// Define default date range
const defaultEndDate = endOfMonth(new Date());
const defaultStartDate = startOfMonth(defaultEndDate);

// Custom Session Storage with Base64 encoding (Placeholder for encryption)
const createSessionStorageWithEncoding = (): StateStorage => {
  const storage = sessionStorage;
  return {
    getItem: (name) => {
      const str = storage.getItem(name);
      if (!str) return null;
      // IMPORTANT: This is Base64 encoding, NOT real encryption.
      try {
        const decodedStr = decode(str);
        return decodedStr;
      } catch (e) {
        console.error(`Failed to decode item "${name}" from sessionStorage`, e);
        return null;
      }
    },
    setItem: (name, value) => {
      // IMPORTANT: This is Base64 encoding, NOT real encryption.
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
    startDate: Date | undefined; // Add start date state
    endDate: Date | undefined;   // Add end date state
    setStartDate: (date: Date | undefined) => void; // Add action to set start date
    setEndDate: (date: Date | undefined) => void;   // Add action to set end date
    setAssetItems: (items: StatementItem[]) => void; // Action to overwrite state
    setOtherLiabilityItems: (items: OtherLiabilityItem[]) => void; // Action to overwrite state
    addAssetItem: (itemData: Omit<StatementItem, 'id'>) => void;
    addOtherLiabilityItem: (itemData: Omit<OtherLiabilityItem, 'id'>) => void;
    updateAssetItem: (updatedItem: StatementItem) => void;
    updateOtherLiabilityItem: (updatedItem: OtherLiabilityItem) => void;
    deleteAssetItem: (id: string) => void;
    deleteOtherLiabilityItem: (id: string) => void;
    clearStatementItems: () => void; // Action to clear state (items only)
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
            setStartDate: (date) => set({ startDate: date }), // Implement setStartDate
            setEndDate: (date) => set({ endDate: date }),     // Implement setEndDate
            // Action to replace the entire asset items array
            setAssetItems: (items) => set({ assetItems: sortItems(items || []) }),
            // Action to replace the entire other liability items array
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
             clearStatementItems: () => set({
                 assetItems: [],
                 otherLiabilityItems: [],
                 // Keep dates as they are not typically "cleared" on sign-out, maybe reset?
                 // Or handle date reset separately if needed.
                 // startDate: defaultStartDate,
                 // endDate: defaultEndDate,
             }),
        }),
        {
            name: 'ifcGuru_statementItems', // Local storage key updated
            storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use encoded sessionStorage
             // Ensure items are sorted after deserialization
             deserialize: (str) => {
                const state = JSON.parse(str);
                 // Custom deserialization to handle Dates
                 const reviver = (key: string, value: any) => {
                   if (value && typeof value === 'object' && value.__type === 'Date') {
                     return new Date(value.value);
                   }
                   return value;
                 };

                 const parsedState = JSON.parse(JSON.stringify(state.state), reviver);
                 parsedState.assetItems = sortItems(parsedState.assetItems || []);
                 parsedState.otherLiabilityItems = sortItems(parsedState.otherLiabilityItems || []);
                 // Ensure dates are Date objects or undefined after loading
                 parsedState.startDate = parsedState.startDate ? new Date(parsedState.startDate) : defaultStartDate;
                 parsedState.endDate = parsedState.endDate ? new Date(parsedState.endDate) : defaultEndDate;

                return { ...state, state: parsedState };
            },
            // Need to handle Date serialization for startDate/endDate
            serialize: (state) => {
                 // Custom serialization to handle Dates
                 const replacer = (key: string, value: any) => {
                   if (value instanceof Date) {
                     return { __type: 'Date', value: value.toISOString() };
                   }
                   return value;
                 };
                 return JSON.stringify({ ...state, state: JSON.parse(JSON.stringify(state.state, replacer)) });
            },

        }
    )
);

// Selectors
export const selectTotalAssets = (state: StatementState): number =>
    state.assetItems.reduce((sum, item) => sum + item.amount, 0);

export const selectTotalOtherLiabilities = (state: StatementState): number =>
    state.otherLiabilityItems.reduce((sum, item) => sum + item.amount, 0);

// Selectors for dates (optional, but can be useful)
export const selectStartDate = (state: StatementState): Date | undefined => state.startDate;
export const selectEndDate = (state: StatementState): Date | undefined => state.endDate;