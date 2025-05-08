// src/store/notificationStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { NotificationItem, NotificationType } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils';

const MAX_NOTIFICATIONS = 50; // Limit the number of stored notifications

// Generate unique IDs
const generateId = (): string => `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to sort notifications by timestamp descending (most recent first)
const sortNotifications = (items: NotificationItem[]): NotificationItem[] => {
  // Ensure items is an array and filter out invalid entries
  if (!Array.isArray(items)) return [];
  return [...items]
      .filter(n => n?.timestamp instanceof Date && !isNaN(n.timestamp.getTime())) // Ensure valid Date objects
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};


// Custom Session Storage with Base64 encoding
const createSessionStorageWithEncoding = (): StateStorage => {
  const storage = sessionStorage;
  return {
    getItem: (name) => {
      if (typeof sessionStorage === 'undefined') return null; // Check if sessionStorage is available
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
      if (typeof sessionStorage === 'undefined') return; // Check if sessionStorage is available
      try {
        const encodedValue = encode(value);
        storage.setItem(name, encodedValue);
      } catch (e) {
        console.error(`Failed to encode item "${name}" for sessionStorage`, e);
      }
    },
    removeItem: (name) => {
        if (typeof sessionStorage === 'undefined') return; // Check if sessionStorage is available
        storage.removeItem(name);
    },
  };
};

interface NotificationState {
  notifications: NotificationItem[];
  isHydrated: boolean; // Track hydration status
  addNotification: (notificationData: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => NotificationItem;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAllNotifications: () => void;
  setNotifications: (notifications: NotificationItem[]) => void; // For initializing from sync
  unreadCount: () => number;
}

// Define the initial state
const initialState = {
  notifications: [], // Start with empty array, sync/services will populate
  isHydrated: false,
};


export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setNotifications: (items) => {
        // Validate and ensure Date objects are correct during set
         const validatedNotifications = (items || []).map(n => ({
             ...n,
             // Ensure timestamp is a valid Date object
             timestamp: n.timestamp instanceof Date ? n.timestamp : new Date(n.timestamp),
             read: typeof n.read === 'boolean' ? n.read : false, // Default read state
             // Ensure basic fields exist
             id: n.id || generateId(),
             type: n.type || 'info',
             title: n.title || 'Notification',
             message: n.message || '',
          })).filter(n => n.timestamp instanceof Date && !isNaN(n.timestamp.getTime())); // Filter out items with invalid dates after conversion

          set({ notifications: sortNotifications(validatedNotifications).slice(0, MAX_NOTIFICATIONS), isHydrated: true });
      },

      addNotification: (notificationData) => {
        const newNotification: NotificationItem = {
          id: generateId(),
          ...notificationData,
          timestamp: new Date(), // Always use current time for new notifications
          read: false,
        };
        set((state) => ({
          notifications: sortNotifications([newNotification, ...state.notifications]).slice(0, MAX_NOTIFICATIONS), // Add and enforce limit
        }));
        return newNotification;
      },

      markAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        }));
      },

      deleteNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      },

      clearAllNotifications: () => set({ notifications: [], isHydrated: true }), // Reset to empty array, keep hydrated

      unreadCount: () => get().notifications.filter(n => !n.read).length,
    }),
    {
      name: 'ifcGuru_notifications', // Persist notifications
      storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use encoded session storage
       onRehydrateStorage: () => (state) => {
         if (state) {
           state.isHydrated = true;
            // console.log("Notification store rehydrated."); // Console log commented out
         }
       },
       serialize: (state) => {
         // Custom replacer to handle Date objects correctly
         const replacer = (key: string, value: any) => {
           if (key === 'timestamp' && value instanceof Date) {
             return { __type: 'Date', value: value.toISOString() };
           }
           return value;
         };
         // Exclude the isHydrated flag from being persisted
         const { isHydrated, ...stateToSave } = state.state;
         const dataToSave = JSON.parse(JSON.stringify(stateToSave, replacer));
         return JSON.stringify({ ...state, state: dataToSave });
       },
       deserialize: (str) => {
         const state = JSON.parse(str);
          // Custom reviver to restore Date objects
         const reviver = (key: string, value: any) => {
           if (value && typeof value === 'object' && value.__type === 'Date') {
             const parsedDate = new Date(value.value);
             return !isNaN(parsedDate.getTime()) ? parsedDate : new Date(0); // Default if invalid
           }
           return value;
         };
         const parsedState = JSON.parse(JSON.stringify(state.state), reviver);
         // Ensure notifications array exists and sort after reviving dates
         parsedState.notifications = sortNotifications(parsedState.notifications || []);
         parsedState.isHydrated = true; // Mark as hydrated
         return { ...state, state: parsedState };
       },
    }
  )
);