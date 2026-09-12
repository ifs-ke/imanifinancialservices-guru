// src/services/adminLogService.ts
/**
 * @file adminLogService.ts
 * @description Centralized logging service for admin log reviews, compliance audit trails, and error inspection.
 */

import { db } from '@/lib/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  where, 
  deleteDoc 
} from 'firebase/firestore';
import { logInfo, logError } from '@/lib/logger';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export type LogCategory = 
  | 'AUTH' 
  | 'USER_MANAGEMENT' 
  | 'DATA_SYNC' 
  | 'USAGE_BILLING' 
  | 'SECURITY' 
  | 'SYSTEM';

export interface SystemAuditLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  userId?: string;
  userEmail?: string;
  action: string;
  details?: Record<string, any>;
  ipOrDevice?: string;
}

/**
 * Records an immutable audit log entry into Firestore.
 */
export async function recordAuditLog(
  action: string,
  category: LogCategory,
  level: LogLevel = 'INFO',
  meta: {
    userId?: string;
    userEmail?: string;
    details?: Record<string, any>;
    ipOrDevice?: string;
  } = {}
): Promise<void> {
  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const entry: SystemAuditLog = {
    id: logId,
    timestamp: new Date().toISOString(),
    level,
    category,
    action,
    userId: meta.userId || 'system',
    userEmail: meta.userEmail || 'system@ifs-guru.com',
    details: meta.details || {},
    ipOrDevice: meta.ipOrDevice || (typeof navigator !== 'undefined' ? navigator.userAgent : 'server'),
  };

  try {
    const ref = doc(db, 'auditLogs', logId);
    await setDoc(ref, entry);
  } catch (err) {
    // Fallback to console logger if firestore write fails
    console.error('Failed to write audit log to Firestore:', err);
  }
}

/**
 * Fetches recent audit logs for the admin review console.
 */
export async function fetchAuditLogs(options: {
  maxResults?: number;
  level?: LogLevel | 'ALL';
  category?: LogCategory | 'ALL';
  search?: string;
} = {}): Promise<SystemAuditLog[]> {
  const max = options.maxResults || 100;

  try {
    const logsRef = collection(db, 'auditLogs');
    const q = query(logsRef, orderBy('timestamp', 'desc'), limit(max));
    const snap = await getDocs(q);

    let logs: SystemAuditLog[] = snap.docs.map(d => d.data() as SystemAuditLog);

    if (options.level && options.level !== 'ALL') {
      logs = logs.filter(l => l.level === options.level);
    }
    if (options.category && options.category !== 'ALL') {
      logs = logs.filter(l => l.category === options.category);
    }
    if (options.search && options.search.trim()) {
      const term = options.search.toLowerCase();
      logs = logs.filter(
        l =>
          l.action.toLowerCase().includes(term) ||
          l.userEmail?.toLowerCase().includes(term) ||
          l.userId?.toLowerCase().includes(term) ||
          JSON.stringify(l.details || {}).toLowerCase().includes(term)
      );
    }

    return logs;
  } catch (err) {
    logError('Error fetching audit logs', err);
    return [];
  }
}

/**
 * Exports logs to CSV formatted string.
 */
export function exportLogsToCsv(logs: SystemAuditLog[]): string {
  const headers = ['Timestamp', 'Level', 'Category', 'Action', 'User Email', 'User ID', 'Details'];
  const rows = logs.map(l => [
    `"${l.timestamp}"`,
    `"${l.level}"`,
    `"${l.category}"`,
    `"${l.action.replace(/"/g, '""')}"`,
    `"${l.userEmail || ''}"`,
    `"${l.userId || ''}"`,
    `"${JSON.stringify(l.details || {}).replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Exports logs to JSON formatted string.
 */
export function exportLogsToJson(logs: SystemAuditLog[]): string {
  return JSON.stringify(logs, null, 2);
}
