// src/store/notificationStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { NotificationItem, NotificationType } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils';

const MAX_NOTIFICATIONS = 50; 

const generateId = (): string => `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const sortNotifications = (items: NotificationItem[]): NotificationItem[] => {
  if (!Array.isArray(items)) return [];
  return [...items]
      .filter(n => n?.timestamp instanceof Date && !isNaN(n.timestamp.getTime())) 
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

const createSessionStorageWithEncoding = (): StateStorage => {
  const storage = typeof window !== 'undefined' ? sessionStorage : undefined;
  return {
    getItem: (name) => {
      if (!storage) return null;
      const str = storage.getItem(name);
      if (!str) return null;
      try {
        const decodedStr = decode(str);
        return JSON.parse(decodedStr, (key, value) => {
            if (key === 'timestamp' && typeof value === 'string') {
                const parsedDate = new Date(value);
                return !isNaN(parsedDate.getTime()) ? parsedDate : new Date(0);
            }
            return value;
        });
      } catch (e) {
        // console.error(`Failed to decode/parse item "${name}" from sessionStorage`, e); // Console log disabled
        return null;
      }
    },
    setItem: (name, value) => {
      if (!storage) return;
      try {
        const stringifiedValue = JSON.stringify(value, (key, val) => {
            if (key === 'timestamp' && val instanceof Date) {
                return val.toISOString();
            }
            return val;
        });
        const encodedValue = encode(stringifiedValue);
        storage.setItem(name, encodedValue);
      } catch (e) {
        // console.error(`Failed to encode/stringify item "${name}" for sessionStorage`, e); // Console log disabled
      }
    },
    removeItem: (name) => storage?.removeItem(name),
  };
};

interface NotificationState {
  notifications: NotificationItem[];
  isHydrated: boolean; 
  addNotification: (notificationData: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => NotificationItem;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAllNotifications: () => void;
  setNotifications: (notifications: NotificationItem[]) => void; 
  unreadCount: () => number;
}

const initialState = {
  notifications: [], 
  isHydrated: false,
};

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setNotifications: (items) => {
         const validatedNotifications = (items || []).map(n => ({
             ...n,
             timestamp: n.timestamp instanceof Date ? n.timestamp : new Date(n.timestamp),
             read: typeof n.read === 'boolean' ? n.read : false, 
             id: n.id || generateId(),
             type: n.type || 'info',
             title: n.title || 'Notification',
             message: n.message || '',
          })).filter(n => n.timestamp instanceof Date && !isNaN(n.timestamp.getTime())); 

          set({ notifications: sortNotifications(validatedNotifications).slice(0, MAX_NOTIFICATIONS), isHydrated: true });
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

      clearAllNotifications: () => set({ notifications: [], isHydrated: true }), 

      unreadCount: () => get().notifications.filter(n => !n.read).length,
    }),
    {
      name: 'ifcGuru_notifications', 
      storage: createJSONStorage(createSessionStorageWithEncoding), // Use the new storage option
       onRehydrateStorage: () => (state) => {
         if (state) {
           state.isHydrated = true;
            // console.log("Notification store rehydrated."); // Console log disabled
         }
       },
       // partialize: (state) => ({ notifications: state.notifications }),
    }
  )
);
