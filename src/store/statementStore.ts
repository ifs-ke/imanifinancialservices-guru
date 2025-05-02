
// src/store/statementStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StatementItem, OtherLiabilityItem } from '@/lib/types';

// Generate unique IDs
const generateId = (prefix: 'asset' | 'lia'): string => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to sort items alphabetically by description
const sortItems = <T extends { description: string }>(items: T[]): T[] => {
    return [...items].sort((a, b) => a.description.localeCompare(b.description));
};

interface StatementState {
    assetItems: StatementItem[];
    otherLiabilityItems: OtherLiabilityItem[];
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
            name: 'debtConqueror_statementItems', // Combined storage key
            storage: createJSONStorage(() => localStorage),
             // Ensure items are sorted after deserialization
             deserialize: (str) => {
                const state = JSON.parse(str);
                state.state.assetItems = sortItems(state.state.assetItems || []);
                state.state.otherLiabilityItems = sortItems(state.state.otherLiabilityItems || []);
                return state;
            },
        }
    )
);

// Selectors
export const selectTotalAssets = (state: StatementState): number =>
    state.assetItems.reduce((sum, item) => sum + item.amount, 0);

export const selectTotalOtherLiabilities = (state: StatementState): number =>
    state.otherLiabilityItems.reduce((sum, item) => sum + item.amount, 0);
