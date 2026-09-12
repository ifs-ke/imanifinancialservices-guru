// src/services/auditorService.ts
/**
 * @file auditorService.ts
 * @description Service for Auditor operations, read-only client financial reviews, and compliance sign-offs.
 */

import { db } from '@/lib/firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  query, 
  orderBy, 
  where 
} from 'firebase/firestore';
import { recordAuditLog } from '@/services/adminLogService';
import { logError } from '@/lib/logger';

export interface AuditVerificationRecord {
  id: string;
  auditorId: string;
  auditorEmail: string;
  clientId: string;
  clientEmail: string;
  periodKey: string;
  status: 'VERIFIED' | 'FLAGGED' | 'PENDING_CLARIFICATION';
  notes: string;
  dpaComplianceConfirmed: boolean;
  timestamp: string;
}

export interface ClientAuditSummary {
  clientId: string;
  clientEmail: string;
  displayName: string;
  totalTransactionsCount: number;
  totalDebtsCount: number;
  totalAssetsEstimatedKes: number;
  totalDebtsEstimatedKes: number;
  anomaliesDetectedCount: number;
  lastAuditVerification?: AuditVerificationRecord;
}

/**
 * Fetches all audit verification records from Firestore.
 */
export async function getAuditVerifications(clientId?: string): Promise<AuditVerificationRecord[]> {
  try {
    const verifRef = collection(db, 'auditVerifications');
    let q = query(verifRef, orderBy('timestamp', 'desc'));
    if (clientId) {
      q = query(verifRef, where('clientId', '==', clientId), orderBy('timestamp', 'desc'));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as AuditVerificationRecord);
  } catch (err) {
    logError('Error fetching audit verifications', err);
    return [];
  }
}

/**
 * Submits a new formal audit sign-off / compliance verification stamp.
 */
export async function createAuditVerification(
  data: Omit<AuditVerificationRecord, 'id' | 'timestamp'>
): Promise<AuditVerificationRecord> {
  const verifId = `verif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record: AuditVerificationRecord = {
    ...data,
    id: verifId,
    timestamp: new Date().toISOString(),
  };

  const ref = doc(db, 'auditVerifications', verifId);
  await setDoc(ref, record);

  await recordAuditLog(
    `AUDIT_VERIFIED: Client ${data.clientEmail} period ${data.periodKey} status ${data.status}`,
    'SECURITY',
    'INFO',
    {
      userId: data.auditorId,
      userEmail: data.auditorEmail,
      details: { verification: record },
    }
  );

  return record;
}
