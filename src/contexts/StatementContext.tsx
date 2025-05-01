
// src/contexts/StatementContext.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo, useEffect } from 'react';
import type { StatementItem, OtherLiabilityItem } from '@/lib/types';

// Generate unique IDs
const generateId = (prefix: 'asset' | 'lia'): string => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Enhanced Mock Data for Assets (values in KES)
const defaultAssets: StatementItem[] = [
  { id: generateId('asset'), description: 'Checking Account - Bank X', amount: 250000 },
  { id: generateId('asset'), description: 'Savings Account - Bank Y', amount: 1000000 },
  { id: generateId('asset'), description: 'Mpesa Balance', amount: 15000 },
  { id: generateId('asset'), description: 'Investment Portfolio (Stocks)', amount: 750000 },
  { id: generateId('asset'), description: 'Car (Estimated Value)', amount: 800000 },
  { id: generateId('asset'), description: 'Furniture & Electronics (Est.)', amount: 300000 },
  { id: generateId('asset'), description: 'Emergency Fund (Cash)', amount: 50000 },
];

// Enhanced Mock Data for Other Liabilities (values in KES)
const defaultOtherLiabilities: OtherLiabilityItem[] = [
    { id: generateId('lia'), description: 'Unpaid Utility (Water)', amount: 2500 },
    { id: generateId('lia'), description: 'Doctor Bill (Pending)', amount: 12000 },
    { id: generateId('lia'), description: 'Personal Loan (Family)', amount: 50000 },
    { id: generateId('lia'), description: 'Security Deposit (Rent)', amount: 120000 }, // Technically an asset if refundable, but often listed here for cash flow planning
];

const ASSETS_STORAGE_KEY = 'debtConqueror_assets';
const OTHER_LIABILITIES_STORAGE_KEY = 'debtConqueror_otherLiabilities';

interface StatementContextType {
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  setAssetItems: (items: StatementItem[]) => void;
  setOtherLiabilityItems: (items: OtherLiabilityItem[]) => void;
  addAssetItem: (itemData: Omit<StatementItem, 'id'>) => void;
  addOtherLiabilityItem: (itemData: Omit<OtherLiabilityItem, 'id'>) => void;
  updateAssetItem: (updatedItem: StatementItem) => void;
  updateOtherLiabilityItem: (updatedItem: OtherLiabilityItem) => void;
  deleteAssetItem: (id: string) => void;
  deleteOtherLiabilityItem: (id: string) => void;
}

const StatementContext = createContext<StatementContextType | undefined>(undefined);

// Helper to sort statement items alphabetically by description
const sortItems = <T extends { description: string }>(items: T[]): T[] => {
    return [...items].sort((a, b) => a.description.localeCompare(b.description));
};


export const StatementProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // State initialization with localStorage hydration and sorting
  const [assetItems, setAssetItemsState] = useState<StatementItem[]>(() => {
      let items = defaultAssets;
      if (typeof window !== 'undefined') {
        const storedAssets = localStorage.getItem(ASSETS_STORAGE_KEY);
        try {
          items = storedAssets ? JSON.parse(storedAssets) : defaultAssets;
        } catch (e) {
          console.error("Failed to parse assets from localStorage", e);
          items = defaultAssets;
        }
      }
      return sortItems(items); // Sort loaded/default items
  });

  const [otherLiabilityItems, setOtherLiabilityItemsState] = useState<OtherLiabilityItem[]>(() => {
       let items = defaultOtherLiabilities;
       if (typeof window !== 'undefined') {
        const storedLiabilities = localStorage.getItem(OTHER_LIABILITIES_STORAGE_KEY);
         try {
          items = storedLiabilities ? JSON.parse(storedLiabilities) : defaultOtherLiabilities;
        } catch (e) {
          console.error("Failed to parse other liabilities from localStorage", e);
          items = defaultOtherLiabilities;
        }
      }
      return sortItems(items); // Sort loaded/default items
  });

  // --- Persistence Effects ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(ASSETS_STORAGE_KEY, JSON.stringify(assetItems));
    }
  }, [assetItems]);

  useEffect(() => {
     if (typeof window !== 'undefined') {
        localStorage.setItem(OTHER_LIABILITIES_STORAGE_KEY, JSON.stringify(otherLiabilityItems));
    }
  }, [otherLiabilityItems]);

  // --- State Update Functions ---
  const setAssetItems = useCallback((items: StatementItem[]) => {
      setAssetItemsState(sortItems(items)); // Sort when setting directly
  }, []);

   const setOtherLiabilityItems = useCallback((items: OtherLiabilityItem[]) => {
      setOtherLiabilityItemsState(sortItems(items)); // Sort when setting directly
  }, []);

  // Individual item operations now also include sorting
  const addAssetItem = useCallback((itemData: Omit<StatementItem, 'id'>) => {
    const newItem: StatementItem = { id: generateId('asset'), ...itemData };
    setAssetItemsState(prev => sortItems([...prev, newItem]));
  }, []);

  const addOtherLiabilityItem = useCallback((itemData: Omit<OtherLiabilityItem, 'id'>) => {
    const newItem: OtherLiabilityItem = { id: generateId('lia'), ...itemData };
    setOtherLiabilityItemsState(prev => sortItems([...prev, newItem]));
  }, []);

   const updateAssetItem = useCallback((updatedItem: StatementItem) => {
        setAssetItemsState(prev => sortItems(prev.map(item => item.id === updatedItem.id ? updatedItem : item)));
    }, []);

   const updateOtherLiabilityItem = useCallback((updatedItem: OtherLiabilityItem) => {
        setOtherLiabilityItemsState(prev => sortItems(prev.map(item => item.id === updatedItem.id ? updatedItem : item)));
    }, []);

   const deleteAssetItem = useCallback((id: string) => {
        setAssetItemsState(prev => sortItems(prev.filter(item => item.id !== id)));
    }, []);

   const deleteOtherLiabilityItem = useCallback((id: string) => {
        setOtherLiabilityItemsState(prev => sortItems(prev.filter(item => item.id !== id)));
    }, []);


  const contextValue = useMemo(() => ({
    assetItems,
    otherLiabilityItems,
    setAssetItems,
    setOtherLiabilityItems,
    addAssetItem,
    addOtherLiabilityItem,
    updateAssetItem,
    updateOtherLiabilityItem,
    deleteAssetItem,
    deleteOtherLiabilityItem,
  }), [
      assetItems, otherLiabilityItems,
      setAssetItems, setOtherLiabilityItems,
      addAssetItem, addOtherLiabilityItem, updateAssetItem, updateOtherLiabilityItem, deleteAssetItem, deleteOtherLiabilityItem
    ]);

  return (
    <StatementContext.Provider value={contextValue}>
      {children}
    </StatementContext.Provider>
  );
};

export const useStatement = (): StatementContextType => {
  const context = useContext(StatementContext);
  if (context === undefined) {
    throw new Error('useStatement must be used within a StatementProvider');
  }
  return context;
};
