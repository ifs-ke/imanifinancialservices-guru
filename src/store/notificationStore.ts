
// src/store/notificationStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { NotificationItem, NotificationType } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils';
import { logDebug, logInfo } from '@/lib/logger'; 

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
        logDebug(`Failed to decode/parse item "${name}" from sessionStorage`, { error: e });
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
        logDebug(`Failed to encode/stringify item "${name}" for sessionStorage`, { error: e });
      }
    },
    removeItem: (name) => storage?.removeItem(name),
  };
};

export interface NotificationState {
  notifications: NotificationItem[];
  selectedNotificationIds: string[]; 
  isHydrated: boolean; 
  addNotification: (notificationData: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => NotificationItem;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAllNotifications: () => void;
  setNotifications: (notifications: NotificationItem[]) => void; 
  unreadCount: () => number;
  toggleSelectNotification: (id: string) => void; 
  toggleSelectAllNotifications: () => void; 
  markSelectedAsRead: () => void; 
  deleteSelectedNotifications: () => void; 
  clearSelection: () => void; 
}

const initialState: Omit<NotificationState, 'addNotification' | 'markAsRead' | 'markAllAsRead' | 'deleteNotification' | 'clearAllNotifications' | 'setNotifications' | 'unreadCount' | 'toggleSelectNotification' | 'toggleSelectAllNotifications' | 'markSelectedAsRead' | 'deleteSelectedNotifications' | 'clearSelection'> = {
  notifications: [], 
  selectedNotificationIds: [],
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

          set({ notifications: sortNotifications(validatedNotifications).slice(0, MAX_NOTIFICATIONS), isHydrated: true, selectedNotificationIds: [] });
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
          selectedNotificationIds: [] 
        }));
      },

      deleteNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
          selectedNotificationIds: state.selectedNotificationIds.filter(selectedId => selectedId !== id) 
        }));
      },

      clearAllNotifications: () => {
        logInfo("NotificationStore: Clearing all notifications.");
        set({ notifications: [], selectedNotificationIds: [], isHydrated: true });
      }, 

      unreadCount: () => get().notifications.filter(n => !n.read).length,

      toggleSelectNotification: (id) => {
        set((state) => {
          const selectedIndex = state.selectedNotificationIds.indexOf(id);
          if (selectedIndex > -1) {
            return { selectedNotificationIds: state.selectedNotificationIds.filter(selectedId => selectedId !== id) };
          } else {
            return { selectedNotificationIds: [...state.selectedNotificationIds, id] };
          }
        });
      },

      toggleSelectAllNotifications: () => {
        set((state) => {
          if (state.selectedNotificationIds.length === state.notifications.length && state.notifications.length > 0) {
            return { selectedNotificationIds: [] };
          } else {
            return { selectedNotificationIds: state.notifications.map(n => n.id) };
          }
        });
      },

      markSelectedAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            state.selectedNotificationIds.includes(n.id) ? { ...n, read: true } : n
          ),
          selectedNotificationIds: [] 
        }));
      },

      deleteSelectedNotifications: () => {
        set((state) => ({
          notifications: state.notifications.filter((n) => !state.selectedNotificationIds.includes(n.id)),
          selectedNotificationIds: [] 
        }));
      },
      
      clearSelection: () => {
        set({ selectedNotificationIds: [] });
      }
    }),
    {
      name: 'ifcGuru_notifications', 
      storage: createJSONStorage(createSessionStorageWithEncoding),
       onRehydrateStorage: () => (state) => {
         if (state) {
           state.isHydrated = true;
           state.selectedNotificationIds = []; 
           logInfo("NotificationStore: Rehydrated successfully.");
         }
       },
    }
  )
);

