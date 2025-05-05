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
    // Ensure input is an array
    if (!Array.isArray(items)) return [];
    return [...items].sort((a, b) => (a.description || '').localeCompare(b.description || ''));
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

interface StatementState {
    assetItems: StatementItem[];
    otherLiabilityItems: OtherLiabilityItem[];
    startDate: Date | undefined;
    endDate: Date | undefined;
    isHydrated: boolean; // Flag for hydration status
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
    clearStatementItems: () => void; // Action to clear local state
}

// Define the initial state, including default dates
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
            // Setters for date range
            setStartDate: (date) => set({ startDate: date }),
            setEndDate: (date) => set({ endDate: date }),
            // Setters for initializing/overwriting item lists (e.g., from sync)
            setAssetItems: (items) => set({ assetItems: sortItems(items || []), isHydrated: true }),
            setOtherLiabilityItems: (items) => set({ otherLiabilityItems: sortItems(items || []), isHydrated: true }),
            // Add a single asset item
            addAssetItem: (itemData) => {
                const newItem: StatementItem = { id: generateId('asset'), ...itemData };
                set((state) => ({ assetItems: sortItems([...state.assetItems, newItem]) }));
            },
            // Add a single other liability item
            addOtherLiabilityItem: (itemData) => {
                const newItem: OtherLiabilityItem = { id: generateId('lia'), ...itemData };
                set((state) => ({ otherLiabilityItems: sortItems([...state.otherLiabilityItems, newItem]) }));
            },
            // Update an existing asset item
            updateAssetItem: (updatedItem) => {
                set((state) => ({
                    assetItems: sortItems(state.assetItems.map(item => item.id === updatedItem.id ? updatedItem : item))
                }));
            },
            // Update an existing other liability item
            updateOtherLiabilityItem: (updatedItem) => {
                 set((state) => ({
                     otherLiabilityItems: sortItems(state.otherLiabilityItems.map(item => item.id === updatedItem.id ? updatedItem : item))
                 }));
            },
            // Delete an asset item by ID
            deleteAssetItem: (id) => {
                set((state) => ({ assetItems: sortItems(state.assetItems.filter(item => item.id !== id)) }));
            },
            // Delete an other liability item by ID
            deleteOtherLiabilityItem: (id) => {
                set((state) => ({ otherLiabilityItems: sortItems(state.otherLiabilityItems.filter(item => item.id !== id)) }));
            },
            // Clear all statement items and reset dates (used on logout/user change)
            clearStatementItems: () => {
                 console.log("Clearing statement store state (items and dates).");
                 set({ ...initialState, isHydrated: true }); // Reset state but keep hydrated flag true
             },
        }),
        {
            name: 'ifcGuru_statementItems', // Name for persisted data
            storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use session storage with Base64
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                   console.log("Statement store rehydrated.");
                 }
             },
             // Use reviver/replacer for Date objects in startDate/endDate
             serialize: (state) => {
                 const replacer = (key: string, value: any) => {
                   if ((key === 'startDate' || key === 'endDate') && value instanceof Date) {
                     // Store dates as ISO strings
                     return { __type: 'Date', value: value.toISOString() };
                   }
                   return value;
                 };
                 // Exclude isHydrated flag
                 const { isHydrated, ...stateToSave } = state.state;
                 const dataToSave = JSON.parse(JSON.stringify(stateToSave, replacer));
                 return JSON.stringify({ ...state, state: dataToSave });
            },
            deserialize: (str) => {
               const state = JSON.parse(str);
               const reviver = (key: string, value: any) => {
                 if (value && typeof value === 'object' && value.__type === 'Date') {
                    const parsedDate = new Date(value.value);
                    // Return Date object if valid, otherwise undefined to use defaults later
                    return !isNaN(parsedDate.getTime()) ? parsedDate : undefined;
                 }
                 // Handle potential string dates during migration/manual edits (optional but safer)
                 if ((key === 'startDate' || key === 'endDate') && typeof value === 'string') {
                     try {
                         const parsedDate = new Date(value);
                         if (!isNaN(parsedDate.getTime())) return parsedDate;
                     } catch (e) {}
                     return undefined; // Return undefined if string parsing fails
                 }
                 return value;
               };
               // Apply reviver during parsing
               const parsedState = JSON.parse(JSON.stringify(state.state), reviver);
               // Ensure arrays exist and sort items after reviving
               parsedState.assetItems = sortItems(parsedState.assetItems || []);
               parsedState.otherLiabilityItems = sortItems(parsedState.otherLiabilityItems || []);
               // Set default dates if parsing failed or dates are invalid/undefined
               parsedState.startDate = parsedState.startDate instanceof Date && !isNaN(parsedState.startDate.getTime()) ? parsedState.startDate : defaultStartDate;
               parsedState.endDate = parsedState.endDate instanceof Date && !isNaN(parsedState.endDate.getTime()) ? parsedState.endDate : defaultEndDate;
               parsedState.isHydrated = true; // Mark as hydrated
               return { ...state, state: parsedState };
           },
            // GDPR/Security Note: Same session storage limitations apply here.
            // Base64 is not encryption. `clearStatementItems` is vital for security on logout.
        }
    )
);

// ===== Selectors =====

/**
 * Selects the total value of all asset items.
 */
export const selectTotalAssets = (state: StatementState): number =>
    state.assetItems.reduce((sum, item) => sum + (item.amount || 0), 0);

/**
 * Selects the total value of all other liability items.
 */
export const selectTotalOtherLiabilities = (state: StatementState): number =>
    state.otherLiabilityItems.reduce((sum, item) => sum + (item.amount || 0), 0);

/**
 * Selects the start date for statements.
 */
export const selectStartDate = (state: StatementState): Date | undefined => state.startDate;

/**
 * Selects the end date for statements.
 */
export const selectEndDate = (state: StatementState): Date | undefined => state.endDate;
