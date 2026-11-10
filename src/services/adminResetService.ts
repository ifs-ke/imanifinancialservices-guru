// src/services/adminResetService.ts
/**
 * @file adminResetService.ts
 * @description Administrative service providing secure database purges, partial resets, and realistic data seeding.
 * Designed with defensive checks to prevent admin lockout and optimized using Firestore WriteBatches.
 */

import { db, auth } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  limit,
} from 'firebase/firestore';
import { recordAuditLog } from '@/services/adminLogService';
import { updatePricingRateCard } from '@/lib/payPerUse';
import { AppUserProfile } from '@/lib/roles';

// List of all subcollections inside a user profile document
const USER_SUBCOLLECTIONS = [
  'transactions',
  'debts',
  'assetItems',
  'otherLiabilityItems',
  'budgetItems',
  'investmentItems',
  'weeklyReviews',
  'notifications',
  'testEntries',
];

export interface ResetOptions {
  mode: 'wipe_financial' | 'wipe_logs' | 'wipe_all';
  seedDemo: boolean;
}

export interface ResetResult {
  success: boolean;
  message: string;
  counts: {
    usersDeleted: number;
    subDocsDeleted: number;
    logsDeleted: number;
    sharedReviewsDeleted: number;
    verificationsDeleted: number;
    seededUsers: number;
    seededSubDocs: number;
  };
}

/**
 * Safely deletes all documents in a collection query using WriteBatches (capped at 400 per batch).
 * Returns the total number of deleted documents.
 */
async function batchDeleteQuery(colRef: any): Promise<number> {
  let count = 0;
  let hasMore = true;

  while (hasMore) {
    const q = query(colRef, limit(400));
    const snap = await getDocs(q);
    if (snap.empty) {
      hasMore = false;
      break;
    }

    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      batch.delete(d.ref);
    });

    await batch.commit();
    count += snap.size;
    
    // If we fetched fewer than 400 docs, we are finished
    if (snap.size < 400) {
      hasMore = false;
    }
  }

  return count;
}

/**
 * Executes a tailored database purge and optional seeding according to the requested options.
 */
export async function executeFirestoreReset(
  options: ResetOptions,
  currentAdminEmail: string
): Promise<ResetResult> {
  const currentUid = auth.currentUser?.uid;
  
  const result: ResetResult = {
    success: false,
    message: '',
    counts: {
      usersDeleted: 0,
      subDocsDeleted: 0,
      logsDeleted: 0,
      sharedReviewsDeleted: 0,
      verificationsDeleted: 0,
      seededUsers: 0,
      seededSubDocs: 0,
    },
  };

  try {
    const batch = writeBatch(db);
    const nowStr = new Date().toISOString();

    // 1. Audit Logs Reset
    if (options.mode === 'wipe_logs' || options.mode === 'wipe_all') {
      const logsRef = collection(db, 'auditLogs');
      result.counts.logsDeleted = await batchDeleteQuery(logsRef);
    }

    // 2. Financial & User Reset
    if (options.mode === 'wipe_financial' || options.mode === 'wipe_all') {
      // Clear all Shared Reviews
      const sharedRef = collection(db, 'sharedReviews');
      // For each shared review, check and clear chats subcollection
      const sharedSnap = await getDocs(sharedRef);
      for (const shareDoc of sharedSnap.docs) {
        const chatsRef = collection(db, 'sharedReviews', shareDoc.id, 'chats');
        result.counts.subDocsDeleted += await batchDeleteQuery(chatsRef);
        await deleteDoc(shareDoc.ref);
        result.counts.sharedReviewsDeleted++;
      }

      // Clear all Period Verifications
      const verificationsRef = collection(db, 'auditVerifications');
      result.counts.verificationsDeleted = await batchDeleteQuery(verificationsRef);

      // Fetch all users to clear subcollections
      const usersRef = collection(db, 'users');
      const usersSnap = await getDocs(usersRef);

      for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        const isSelf = currentUid === userId;
        const isSean = userId === 'admin-seanwambua-uid' || userDoc.data().email === 'seanwambua@gmail.com';

        // Delete all subcollection documents
        for (const subName of USER_SUBCOLLECTIONS) {
          const subColRef = collection(db, 'users', userId, subName);
          result.counts.subDocsDeleted += await batchDeleteQuery(subColRef);
        }

        // If performing full wipe, delete user profile unless they are self or super admin
        if (options.mode === 'wipe_all') {
          if (isSelf || isSean) {
            // Keep self/Sean profile, but reset spending limits / metadata to fresh start
            const userPatch = {
              incurredCostKes: 0,
              totalReads: 0,
              totalWrites: 0,
              totalStorageKb: 64,
              totalApiCalls: 0,
              totalAiForecasts: 0,
              updatedAt: nowStr,
            };
            await setDoc(userDoc.ref, userPatch, { merge: true });
          } else {
            // Safely delete non-essential user profiles
            await deleteDoc(userDoc.ref);
            // Also clear registry mappings if any
            await deleteDoc(doc(db, 'admins', userId));
            await deleteDoc(doc(db, 'auditors', userId));
            result.counts.usersDeleted++;
          }
        } else {
          // 'wipe_financial' only -> Keep all profiles but reset cost meters to 0
          const userPatch = {
            incurredCostKes: 0,
            totalReads: 0,
            totalWrites: 0,
            totalStorageKb: 64,
            totalApiCalls: 0,
            totalAiForecasts: 0,
            updatedAt: nowStr,
          };
          await setDoc(userDoc.ref, userPatch, { merge: true });
        }
      }

      // Reset pricing Rate Card to initial clean state
      await updatePricingRateCard({
        readCostKes: 0.05,
        writeCostKes: 0.15,
        storageMbMonthKes: 2.5,
        apiCallCostKes: 0.5,
        aiForecastCostKes: 2.0,
      });
    }

    // 3. Optional Seeding of Professional Mock Data
    if (options.seedDemo) {
      await seedRealisticDemoData(result, nowStr);
    }

    // 4. Record Administrative Action
    await recordAuditLog(
      `FIRESTORE_RESET: Mode '${options.mode}' (Seeded: ${options.seedDemo})`,
      'SYSTEM',
      'WARN',
      {
        userEmail: currentAdminEmail,
        details: {
          resetOptions: options,
          resultsSummary: result.counts,
        },
      }
    );

    result.success = true;
    result.message = `Database reset successfully completed. Purged ${result.counts.usersDeleted} users, ${result.counts.subDocsDeleted} user subdocuments, and ${result.counts.logsDeleted} audit log items.`;
    
    if (options.seedDemo) {
      result.message += ` Seeded ${result.counts.seededUsers} demo accounts with ${result.counts.seededSubDocs} financial data points.`;
    }

  } catch (error: any) {
    console.error('Failed to reset Firestore:', error);
    result.success = false;
    result.message = `Reset failed: ${error?.message || String(error)}`;
  }

  return result;
}

/**
 * Seeds a comprehensive dataset of realistic users, transactions, Saccos, debts, budgets, and reviews.
 */
async function seedRealisticDemoData(result: ResetResult, nowStr: string) {
  const seedUsers = [
    {
      uid: 'demo-user-alex-uid',
      email: 'alex@ifs-guru.com',
      displayName: 'Alex Mwangi',
      role: 'client' as const,
      status: 'active' as const,
      spendingLimitKes: 3000,
      transactions: [
        { date: new Date(Date.now() - 1 * 86400000).toISOString(), description: 'Equity Bank Salary Deposit', amount: 145000, modeOfPayment: 'Bank', frequency: 'recurring', variability: 'fixed', categoryName: 'Salary', notes: 'Monthly payroll dispatch' },
        { date: new Date(Date.now() - 3 * 86400000).toISOString(), description: 'Naivas Supermarket Grocery Run', amount: -6500, modeOfPayment: 'Mobile Money', frequency: 'one-time', variability: 'variable', categoryName: 'Food', notes: 'Weekly pantry supply' },
        { date: new Date(Date.now() - 5 * 86400000).toISOString(), description: 'Kitengela Rent Payment', amount: -28000, modeOfPayment: 'Bank', frequency: 'recurring', variability: 'fixed', categoryName: 'Rent', notes: 'Apartment rent transfer' },
        { date: new Date(Date.now() - 8 * 86400000).toISOString(), description: 'Zuku Internet Subscription', amount: -4299, modeOfPayment: 'Mobile Money', frequency: 'recurring', variability: 'fixed', categoryName: 'Utilities', notes: 'Home fiber package' },
        { date: new Date(Date.now() - 12 * 86400000).toISOString(), description: 'Side Hustle App Consultancy', amount: 25000, modeOfPayment: 'Mobile Money', frequency: 'one-time', variability: 'variable', categoryName: 'Investments', notes: 'UI design consulting invoice' },
      ],
      debts: [
        { description: 'HELB Student Loan', principal: 180000, interestRate: 4, minPayment: 2500, term: 'long' },
        { description: 'NCBA Logbook Loan', principal: 320000, interestRate: 12, minPayment: 15000, term: 'medium' },
      ],
      budgetItems: [
        { categoryName: 'Food', limitKes: 15000, period: 'monthly', alertThreshold: 85 },
        { categoryName: 'Utilities', limitKes: 10000, period: 'monthly', alertThreshold: 90 },
        { categoryName: 'Entertainment', limitKes: 8000, period: 'monthly', alertThreshold: 75 },
      ],
      assetItems: [
        { description: 'Stima Sacco Shares', value: 120000, category: 'Savings', notes: 'Dividend yield rate of 11% p.a.', isAsset: true },
        { description: 'Kitengela 1/8th Acre Plot', value: 950000, category: 'Property', notes: 'Valued in KES, appreciating rapidly', isAsset: true },
      ],
      otherLiabilityItems: [
        { description: 'Sacco emergency loan balance', value: 35000, category: 'Other', notes: 'Interest paid upfront' },
      ],
      weeklyReviews: [
        {
          id: 'review_q3_alex',
          title: 'Financial Review - Period 2026-W36',
          status: 'COMPLETED',
          score: 82,
          summary: 'Excellent progress on budgeting this week. Spending remained below thresholds, and a side-hustle consulting invoice was successfully cleared. Recommend adding savings towards Sacco emergency loan repayment.',
          periodKey: '2026-W36',
          savingsRate: 15.4,
          debtPaymentRatio: 12.1,
          createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
        }
      ],
      notifications: [
        { id: 'notif_alex_1', title: 'Monthly Budget Threshold', message: 'You have consumed 78% of your Food allowance for this period.', type: 'alert', read: false, createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
        { id: 'notif_alex_2', title: 'Data Sync Verification', message: 'Your offline storage queue was successfully committed to Cloud Firestore.', type: 'info', read: true, createdAt: new Date(Date.now() - 4 * 86400000).toISOString() },
      ],
      investmentItems: [
        { id: 'inv_alex_1', name: 'Safaricom Stock (NSE: SCOM)', type: 'equity', assetValue: 45000, expectedReturnRate: 8.5, description: 'Long term dividend growth equity hold.' },
        { id: 'inv_alex_2', name: 'Kenya Government Treasury Bill', type: 'fixed_income', assetValue: 100000, expectedReturnRate: 11.2, description: '91-Day government debt portfolio.' },
      ]
    },
    {
      uid: 'demo-user-sarah-uid',
      email: 'sarah@ifs-guru.com',
      displayName: 'Sarah Kemunto',
      role: 'auditor' as const,
      status: 'active' as const,
      spendingLimitKes: 5000,
      transactions: [],
      debts: [],
      budgetItems: [],
      assetItems: [],
      otherLiabilityItems: [],
      weeklyReviews: [],
      notifications: [
        { id: 'notif_sarah_1', title: 'Compliance Audit Assignment', message: 'You have been assigned to audit client profile Alex Mwangi for Q3 2026.', type: 'info', read: false, createdAt: new Date(Date.now() - 1 * 86400000).toISOString() }
      ],
      investmentItems: []
    }
  ];

  for (const sUser of seedUsers) {
    const userRef = doc(db, 'users', sUser.uid);
    const userProfile: AppUserProfile = {
      uid: sUser.uid,
      email: sUser.email,
      displayName: sUser.displayName,
      role: sUser.role,
      status: sUser.status,
      spendingLimitKes: sUser.spendingLimitKes,
      incurredCostKes: sUser.role === 'client' ? 45.50 : 0,
      totalReads: sUser.role === 'client' ? 245 : 12,
      totalWrites: sUser.role === 'client' ? 42 : 1,
      totalStorageKb: 128,
      totalApiCalls: sUser.role === 'client' ? 18 : 1,
      totalAiForecasts: sUser.role === 'client' ? 4 : 0,
      createdAt: nowStr,
      updatedAt: nowStr,
      permissions: {
        canExportData: true,
        canShareReviews: sUser.role !== 'auditor',
        canRunAiProjections: true,
      }
    };

    // Save profile record
    await setDoc(userRef, userProfile);
    
    // Set appropriate registry entries
    if (sUser.role === 'auditor') {
      await setDoc(doc(db, 'auditors', sUser.uid), { uid: sUser.uid, assignedAt: nowStr });
    }

    result.counts.seededUsers++;

    // Seed Subcollections for this user
    // 1. Transactions
    if (sUser.transactions.length > 0) {
      for (let i = 0; i < sUser.transactions.length; i++) {
        const tx = sUser.transactions[i];
        const txRef = doc(db, 'users', sUser.uid, 'transactions', `tx_seed_${i}`);
        await setDoc(txRef, tx);
        result.counts.seededSubDocs++;
      }
    }

    // 2. Debts
    if (sUser.debts.length > 0) {
      for (let i = 0; i < sUser.debts.length; i++) {
        const dRef = doc(db, 'users', sUser.uid, 'debts', `debt_seed_${i}`);
        await setDoc(dRef, sUser.debts[i]);
        result.counts.seededSubDocs++;
      }
    }

    // 3. Budgets
    if (sUser.budgetItems.length > 0) {
      for (let i = 0; i < sUser.budgetItems.length; i++) {
        const bRef = doc(db, 'users', sUser.uid, 'budgetItems', `budget_seed_${i}`);
        await setDoc(bRef, sUser.budgetItems[i]);
        result.counts.seededSubDocs++;
      }
    }

    // 4. Asset Items
    if (sUser.assetItems.length > 0) {
      for (let i = 0; i < sUser.assetItems.length; i++) {
        const aRef = doc(db, 'users', sUser.uid, 'assetItems', `asset_seed_${i}`);
        await setDoc(aRef, sUser.assetItems[i]);
        result.counts.seededSubDocs++;
      }
    }

    // 5. Other Liability Items
    if (sUser.otherLiabilityItems.length > 0) {
      for (let i = 0; i < sUser.otherLiabilityItems.length; i++) {
        const lRef = doc(db, 'users', sUser.uid, 'otherLiabilityItems', `liab_seed_${i}`);
        await setDoc(lRef, sUser.otherLiabilityItems[i]);
        result.counts.seededSubDocs++;
      }
    }

    // 6. Weekly Reviews
    if (sUser.weeklyReviews.length > 0) {
      for (const rev of sUser.weeklyReviews) {
        const rRef = doc(db, 'users', sUser.uid, 'weeklyReviews', rev.id);
        await setDoc(rRef, rev);
        result.counts.seededSubDocs++;
      }
    }

    // 7. Notifications
    if (sUser.notifications.length > 0) {
      for (const not of sUser.notifications) {
        const nRef = doc(db, 'users', sUser.uid, 'notifications', not.id);
        await setDoc(nRef, not);
        result.counts.seededSubDocs++;
      }
    }

    // 8. Investments
    if (sUser.investmentItems.length > 0) {
      for (const inv of sUser.investmentItems) {
        const iRef = doc(db, 'users', sUser.uid, 'investmentItems', inv.id);
        await setDoc(iRef, inv);
        result.counts.seededSubDocs++;
      }
    }
  }

  // Seed a realistic compliance signoff
  const auditVerification = {
    id: 'verify_seed_1',
    auditorId: 'demo-user-sarah-uid',
    auditorEmail: 'sarah@ifs-guru.com',
    clientId: 'demo-user-alex-uid',
    clientEmail: 'alex@ifs-guru.com',
    periodKey: '2026-Q3',
    status: 'VERIFIED',
    notes: 'The statutory books of accounts, assets statements, and budget variance logs for client Alex Mwangi have been thoroughly audited. Spending was authenticated, transaction ledger was intact, Sacco dividend statements match declared asset balances, and operations comply with the statutory principles of Kenya Data Protection Act 2019.',
    dpaComplianceConfirmed: true,
    timestamp: nowStr,
  };
  await setDoc(doc(db, 'auditVerifications', 'verify_seed_1'), auditVerification);

  // Seed multiple operational and security audit logs to populate the admin panel instantly
  const auditLogs = [
    {
      id: `log_seed_1_${Date.now()}`,
      timestamp: new Date(Date.now() - 4 * 3600000).toISOString(),
      level: 'INFO' as const,
      category: 'AUTH' as const,
      userId: 'demo-user-alex-uid',
      userEmail: 'alex@ifs-guru.com',
      action: 'USER_LOGIN: Alex Mwangi signed in successfully',
      details: { method: 'google_oauth', browser: 'Mozilla Chrome' },
    },
    {
      id: `log_seed_2_${Date.now()}`,
      timestamp: new Date(Date.now() - 3.5 * 3600000).toISOString(),
      level: 'INFO' as const,
      category: 'DATA_SYNC' as const,
      userId: 'demo-user-alex-uid',
      userEmail: 'alex@ifs-guru.com',
      action: 'DATA_SYNC: Saved 5 transactions and 2 debts to Cloud Firestore',
      details: { isOfflineQueue: false, payloadHash: '8b7a421c' },
    },
    {
      id: `log_seed_3_${Date.now()}`,
      timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
      level: 'WARN' as const,
      category: 'SECURITY' as const,
      userId: 'demo-user-alex-uid',
      userEmail: 'alex@ifs-guru.com',
      action: 'BUDGET_WARNING: Food category exceeded 75% limit',
      details: { consumedKes: 11700, limitKes: 15000 },
    },
    {
      id: `log_seed_4_${Date.now()}`,
      timestamp: new Date(Date.now() - 1 * 3600000).toISOString(),
      level: 'INFO' as const,
      category: 'USAGE_BILLING' as const,
      userId: 'demo-user-alex-uid',
      userEmail: 'alex@ifs-guru.com',
      action: 'METER_UPDATE: Incurred 245 reads, 42 writes, accrued 45.50 KES cost',
      details: { currentBalanceKes: 45.50, limitKes: 3000 },
    },
    {
      id: `log_seed_5_${Date.now()}`,
      timestamp: new Date(Date.now() - 0.2 * 3600000).toISOString(),
      level: 'INFO' as const,
      category: 'SYSTEM' as const,
      userId: 'system',
      userEmail: 'system@ifs-guru.com',
      action: 'SYSTEM_AUDIT: Global Rate Card pricing synchronized from configuration template',
      details: { rateCard: { readCostKes: 0.05, writeCostKes: 0.15 } },
    }
  ];

  for (const logItem of auditLogs) {
    await setDoc(doc(db, 'auditLogs', logItem.id), logItem);
  }
}
