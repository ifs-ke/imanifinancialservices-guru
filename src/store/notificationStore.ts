// src/store/notificationStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { NotificationItem, NotificationType } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils';

const MAX_NOTIFICATIONS = 50; // Limit the number of stored notifications

// Generate unique IDs
const generateId = (): string => `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to sort notifications by timestamp descending
const sortNotifications = (items: NotificationItem[]): NotificationItem[] => {
  return [...items].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

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

interface NotificationState {
  notifications: NotificationItem[];
  addNotification: (notificationData: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => NotificationItem;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAllNotifications: () => void;
  setNotifications: (notifications: NotificationItem[]) => void; // For initializing from sync
  unreadCount: () => number;
}

const initialState = {
  notifications: [
      // Example initial notifications (can be removed)
      {
          id: generateId(),
          type: 'update' as NotificationType,
          title: 'App Update: Collaboration!',
          message: 'You can now share your weekly reviews with other users.',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
          read: false,
      },
      {
          id: generateId(),
          type: 'info' as NotificationType,
          title: 'Welcome to IFC - Guru!',
          message: 'Explore the features and start managing your finances.',
          timestamp: new Date(),
          read: false,
       },
  ],
};

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setNotifications: (items) => {
          const validatedNotifications = (items || []).map(n => ({
              ...n,
              timestamp: n.timestamp instanceof Date ? n.timestamp : new Date(n.timestamp), // Ensure Date object
          }));
          set({ notifications: sortNotifications(validatedNotifications.slice(0, MAX_NOTIFICATIONS)) });
      },

      addNotification: (notificationData) => {
        const newNotification: NotificationItem = {
          id: generateId(),
          ...notificationData,
          timestamp: new Date(),
          read: false,
        };
        set((state) => ({
          notifications: sortNotifications([newNotification, ...state.notifications]).slice(0, MAX_NOTIFICATIONS),
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

      clearAllNotifications: () => set({ notifications: [] }),

      unreadCount: () => get().notifications.filter(n => !n.read).length,
    }),
    {
      name: 'ifcGuru_notifications', // Persist notifications
      storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use encoded session storage
      serialize: (state) => {
         const replacer = (key: string, value: any) => {
           if (value instanceof Date) {
             return { __type: 'Date', value: value.toISOString() };
           }
           return value;
         };
         return JSON.stringify({ ...state, state: JSON.parse(JSON.stringify(state.state, replacer)) });
       },
       deserialize: (str) => {
         const state = JSON.parse(str);
         const reviver = (key: string, value: any) => {
           if (value && typeof value === 'object' && value.__type === 'Date') {
             return new Date(value.value);
           }
           return value;
         };
         const parsedState = JSON.parse(JSON.stringify(state.state), reviver);
         // Sort on hydration
         parsedState.notifications = sortNotifications(parsedState.notifications || []);
         return { ...state, state: parsedState };
       },
    }
  )
);
