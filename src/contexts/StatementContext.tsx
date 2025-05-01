
// src/contexts/StatementContext.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo, useEffect } from 'react';
import type { StatementItem, OtherLiabilityItem } from '@/lib/types';

// Generate unique IDs
const generateId = (prefix: 'asset' | 'lia'): string => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Initial Mock Data for Assets (values in KES) - Used if no localStorage data
const defaultAssets: StatementItem[] = [
  { id: generateId('asset'), description: 'Checking Account', amount: 250000 },
  { id: generateId('asset'), description: 'Savings Account', amount: 1000000 },
  { id: generateId('asset'), description: 'Car (Estimated Value)', amount: 800000 },
  { id: generateId('asset'), description: 'Investments', amount: 500000 },
];

// Initial Mock Data for Other Liabilities (values in KES) - Used if no localStorage data
const defaultOtherLiabilities: OtherLiabilityItem[] = [
    { id: generateId('lia'), description: 'Unpaid Bill (Phone)', amount: 5000 },
    { id: generateId('lia'), description: 'Personal Loan (Friend)', amount: 20000 },
];

const ASSETS_STORAGE_KEY = 'debtConqueror_assets';
const OTHER_LIABILITIES_STORAGE_KEY = 'debtConqueror_otherLiabilities';

interface StatementContextType {
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  setAssetItems: (items: StatementItem[]) => void; // Allow direct setting after edit
  setOtherLiabilityItems: (items: OtherLiabilityItem[]) => void; // Allow direct setting after edit
  addAssetItem: (itemData: Omit<StatementItem, 'id'>) => void;
  addOtherLiabilityItem: (itemData: Omit<OtherLiabilityItem, 'id'>) => void;
  updateAssetItem: (updatedItem: StatementItem) => void;
  updateOtherLiabilityItem: (updatedItem: OtherLiabilityItem) => void;
  deleteAssetItem: (id: string) => void;
  deleteOtherLiabilityItem: (id: string) => void;
}

const StatementContext = createContext<StatementContextType | undefined>(undefined);

export const StatementProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // State initialization with localStorage hydration
  const [assetItems, setAssetItemsState] = useState<StatementItem[]>(() => {
      if (typeof window !== 'undefined') {
        const storedAssets = localStorage.getItem(ASSETS_STORAGE_KEY);
        try {
          return storedAssets ? JSON.parse(storedAssets) : defaultAssets;
        } catch (e) {
          console.error("Failed to parse assets from localStorage", e);
          return defaultAssets;
        }
      }
      return defaultAssets; // Default for server-side rendering or if window undefined
  });

  const [otherLiabilityItems, setOtherLiabilityItemsState] = useState<OtherLiabilityItem[]>(() => {
       if (typeof window !== 'undefined') {
        const storedLiabilities = localStorage.getItem(OTHER_LIABILITIES_STORAGE_KEY);
         try {
          return storedLiabilities ? JSON.parse(storedLiabilities) : defaultOtherLiabilities;
        } catch (e) {
          console.error("Failed to parse other liabilities from localStorage", e);
          return defaultOtherLiabilities;
        }
      }
      return defaultOtherLiabilities;
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
  // Direct setters are needed because the editing happens on a temporary state in the component
  const setAssetItems = useCallback((items: StatementItem[]) => {
      setAssetItemsState(items);
  }, []);

   const setOtherLiabilityItems = useCallback((items: OtherLiabilityItem[]) => {
      setOtherLiabilityItemsState(items);
  }, []);

  // Individual item operations (could be used if editing directly in context, but less practical with current setup)
  const addAssetItem = useCallback((itemData: Omit<StatementItem, 'id'>) => {
    const newItem: StatementItem = { id: generateId('asset'), ...itemData };
    setAssetItemsState(prev => [...prev, newItem]);
  }, []);

  const addOtherLiabilityItem = useCallback((itemData: Omit<OtherLiabilityItem, 'id'>) => {
    const newItem: OtherLiabilityItem = { id: generateId('lia'), ...itemData };
    setOtherLiabilityItemsState(prev => [...prev, newItem]);
  }, []);

   const updateAssetItem = useCallback((updatedItem: StatementItem) => {
        setAssetItemsState(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
    }, []);

   const updateOtherLiabilityItem = useCallback((updatedItem: OtherLiabilityItem) => {
        setOtherLiabilityItemsState(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
    }, []);

   const deleteAssetItem = useCallback((id: string) => {
        setAssetItemsState(prev => prev.filter(item => item.id !== id));
    }, []);

   const deleteOtherLiabilityItem = useCallback((id: string) => {
        setOtherLiabilityItemsState(prev => prev.filter(item => item.id !== id));
    }, []);


  const contextValue = useMemo(() => ({
    assetItems,
    otherLiabilityItems,
    setAssetItems,
    setOtherLiabilityItems,
    // Include individual CRUD if needed elsewhere, though Statements page uses direct setters now
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
