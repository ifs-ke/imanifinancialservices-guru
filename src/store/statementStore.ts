
// src/store/statementStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StatementItem, OtherLiabilityItem } from '@/lib/types';
import { startOfMonth, endOfMonth } from 'date-fns';

// Generate unique IDs
const generateId = (prefix: 'asset' | 'lia'): string => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to sort items alphabetically by description
const sortItems = <T extends { description: string }>(items: T[]): T[] => {
    return [...items].sort((a, b) => a.description.localeCompare(b.description));
};

// Define default date range
const defaultEndDate = endOfMonth(new Date());
const defaultStartDate = startOfMonth(defaultEndDate);

interface StatementState {
    assetItems: StatementItem[];
    otherLiabilityItems: OtherLiabilityItem[];
    startDate: Date | undefined; // Add start date state
    endDate: Date | undefined;   // Add end date state
    setStartDate: (date: Date | undefined) => void; // Add action to set start date
    setEndDate: (date: Date | undefined) => void;   // Add action to set end date
    setAssetItems: (items: StatementItem[]) => void; // Allow direct setting
    setOtherLiabilityItems: (items: OtherLiabilityItem[]) => void; // Allow direct setting
    addAssetItem: (itemData: Omit<StatementItem, 'id'>) => void;
    addOtherLiabilityItem: (itemData: Omit<OtherLiabilityItem, 'id'>) => void;
    updateAssetItem: (updatedItem: StatementItem) => void;
    updateOtherLiabilityItem: (updatedItem: OtherLiabilityItem) => void;
    deleteAssetItem: (id: string) => void;
    deleteOtherLiabilityItem: (id: string) => void;
}

export const useStatementStore = create<StatementState>()(
    persist(
        (set, get) => ({
            assetItems: [],
            otherLiabilityItems: [],
            startDate: defaultStartDate, // Initialize start date
            endDate: defaultEndDate,     // Initialize end date
            setStartDate: (date) => set({ startDate: date }), // Implement setStartDate
            setEndDate: (date) => set({ endDate: date }),     // Implement setEndDate
            setAssetItems: (items) => set({ assetItems: sortItems(items) }),
            setOtherLiabilityItems: (items) => set({ otherLiabilityItems: sortItems(items) }),
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
        }),
        {
            name: 'ifcGuru_statementItems', // Local storage key updated
            storage: createJSONStorage(() => localStorage),
             // Ensure items are sorted after deserialization
             deserialize: (str) => {
                const state = JSON.parse(str);
                state.state.assetItems = sortItems(state.state.assetItems || []);
                state.state.otherLiabilityItems = sortItems(state.state.otherLiabilityItems || []);
                 // Deserialize dates properly
                state.state.startDate = state.state.startDate ? new Date(state.state.startDate) : defaultStartDate;
                state.state.endDate = state.state.endDate ? new Date(state.state.endDate) : defaultEndDate;
                return state;
            },
            // Need to handle Date serialization for startDate/endDate
            serialize: (state) => JSON.stringify({
                ...state,
                state: {
                    ...state.state,
                    // Convert dates to strings for storage if they exist
                    startDate: state.state.startDate?.toISOString(),
                    endDate: state.state.endDate?.toISOString(),
                }
            }),

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
