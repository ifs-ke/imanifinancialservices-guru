// src/store/clientLogStore.ts
import { create } from 'zustand';

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface CapturedLog {
  id: string;
  timestamp: Date;
  level: LogLevel;
  messages: any[]; // Store original messages
}

interface ClientLogState {
  logs: CapturedLog[];
  addLog: (level: LogLevel, messages: any[]) => void;
  clearLogs: () => void;
}

const generateId = (): string => `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
const MAX_CLIENT_LOGS = 200; // Limit the number of logs stored in memory

export const useClientLogStore = create<ClientLogState>((set, get) => ({
  logs: [],
  addLog: (level, messages) => {
    const newLog: CapturedLog = {
      id: generateId(),
      timestamp: new Date(),
      level,
      messages,
    };
    set((state) => ({
      logs: [newLog, ...state.logs].slice(0, MAX_CLIENT_LOGS), // Add to top, keep limited size
    }));
  },
  clearLogs: () => set({ logs: [] }),
}));
