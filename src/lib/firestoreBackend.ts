// src/lib/firestoreBackend.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from '@/lib/firebase';
import type {
  TransactionWithId,
  DebtItem,
  StatementItem,
  OtherLiabilityItem,
  BudgetItem,
  WeeklyReviewData,
  NotificationItem,
  InvestmentItem,
} from '@/lib/types';

export interface SyncedFirestoreData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[];
  investmentItems: InvestmentItem[];
  startDate?: string;
  endDate?: string;
  gettingStartedDismissed: boolean;
}

export function isGuestOrLocalUserId(userId: string): boolean {
  if (!userId) return true;
  const lower = userId.toLowerCase();
  return (
    lower === 'guest' ||
    lower === 'guest_session' ||
    lower === 'anonymous' ||
    lower === 'anonymous_user' ||
    lower === 'anonymous_or_server' ||
    lower.startsWith('guest') ||
    lower.startsWith('usr_local') ||
    lower.startsWith('anon')
  );
}

/**
 * Ensures user profile exists in Firestore
 */
export async function ensureUserInFirestore(userId: string, email: string, name?: string | null) {
  if (!userId) throw new Error('User ID is required');
  if (isGuestOrLocalUserId(userId)) {
    return;
  }
  if (typeof window !== 'undefined' && auth.currentUser && auth.currentUser.uid !== userId) {
    const isCurrentUserAdmin = 
      auth.currentUser.email?.toLowerCase() === 'seanwambua@gmail.com' ||
      auth.currentUser.email?.toLowerCase() === 'rashmore2020@gmail.com';
    if (!isCurrentUserAdmin) {
      return;
    }
  }
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    const now = new Date().toISOString();
    const isAdmin = 
      email.toLowerCase() === 'seanwambua@gmail.com' || 
      email.toLowerCase() === 'rashmore2020@gmail.com' || 
      email.toLowerCase().includes('admin');

    if (!snap.exists()) {
      await setDoc(userRef, {
        id: userId,
        email,
        name: name || email.split('@')[0],
        role: isAdmin ? 'admin' : 'user',
        createdAt: now,
        updatedAt: now,
      });
      if (isAdmin) {
        await setDoc(doc(db, 'admins', userId), {
          id: userId,
          email,
          createdAt: now,
        });
      }
    } else {
      const existing = snap.data();
      await setDoc(
        userRef,
        {
          email,
          name: name || existing.name || email.split('@')[0],
          role: isAdmin ? 'admin' : existing.role || 'user',
          updatedAt: now,
        },
        { merge: true }
      );
    }
  } catch (error) {
    console.warn(`[Firestore] Note on ensureUserInFirestore for ${userId}:`, error instanceof Error ? error.message : error);
  }
}

/**
 * Fetches all user financial data from Firestore
 */
export async function fetchUserDataFromFirestore(userId: string): Promise<SyncedFirestoreData> {
  if (!userId) throw new Error('User ID is required');

  // Guest and anonymous sessions persist exclusively in offline snapshots
  if (isGuestOrLocalUserId(userId)) {
    return {
      transactions: [],
      debts: [],
      assetItems: [],
      otherLiabilityItems: [],
      budgetItems: [],
      ownedReviews: {},
      sharedReviews: {},
      notifications: [],
      investmentItems: [],
      gettingStartedDismissed: false,
    };
  }

  try {
    // 1. Transactions
    const txCol = collection(db, 'users', userId, 'transactions');
    const txSnap = await getDocs(query(txCol, orderBy('date', 'desc')));
    const transactions: TransactionWithId[] = txSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      const dateVal = data.date instanceof Timestamp ? data.date.toDate().toISOString() : data.date || new Date(0).toISOString();
      return {
        id: docSnap.id,
        userId: userId,
        date: dateVal,
        description: data.description || '',
        amount: Number(data.amount) || 0,
        modeOfPayment: data.modeOfPayment || 'Bank',
        frequency: data.frequency || 'one-time',
        variability: data.variability || 'fixed',
        categoryName: data.categoryName || null,
        notes: data.notes || '',
      };
    });

    // 2. Debts
    const debtsCol = collection(db, 'users', userId, 'debts');
    const debtsSnap = await getDocs(query(debtsCol, orderBy('description', 'asc')));
    const debts: DebtItem[] = debtsSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      const dateVal = data.date instanceof Timestamp ? data.date.toDate().toISOString().split('T')[0] : (typeof data.date === 'string' ? data.date : new Date().toISOString().split('T')[0]);
      const dueDateVal = data.dueDate instanceof Timestamp ? data.dueDate.toDate().toISOString().split('T')[0] : (typeof data.dueDate === 'string' ? data.dueDate : null);
      return {
        id: docSnap.id,
        userId: userId,
        date: dateVal,
        dueDate: dueDateVal,
        description: data.description || '',
        classification: data.classification === 'institutional' ? 'institutional' : 'personal',
        principal: Number(data.principal) || 0,
        interestRate: data.interestRate !== undefined && data.interestRate !== null ? Number(data.interestRate) : 0,
        minPayment: Number(data.minPayment) || 0,
        term: data.term || 'short',
        status: data.status || 'active',
        securityType: data.securityType === 'secured' ? 'secured' : 'unsecured',
        securityDescription: data.securityDescription || null,
        notes: data.notes || '',
      };
    });

    // 3. Assets
    const assetsCol = collection(db, 'users', userId, 'assetItems');
    const assetsSnap = await getDocs(query(assetsCol, orderBy('description', 'asc')));
    const assetItems: StatementItem[] = assetsSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        userId: userId,
        description: data.description || '',
        value: Number(data.value) || 0,
        category: data.category || 'Other',
        notes: data.notes || '',
        isAsset: true,
      };
    });

    // 4. Other Liabilities
    const liabCol = collection(db, 'users', userId, 'otherLiabilityItems');
    const liabSnap = await getDocs(query(liabCol, orderBy('description', 'asc')));
    const otherLiabilityItems: OtherLiabilityItem[] = liabSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        userId: userId,
        description: data.description || '',
        value: Number(data.value) || 0,
        category: data.category || 'Other',
        notes: data.notes || '',
      };
    });

    // 5. Budget Items
    const budgetCol = collection(db, 'users', userId, 'budgetItems');
    const budgetSnap = await getDocs(query(budgetCol, orderBy('description', 'asc')));
    const budgetItems: BudgetItem[] = budgetSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        userId: userId,
        description: data.description || '',
        budgetedAmount: Number(data.budgetedAmount) || 0,
        actualAmount: Number(data.actualAmount) || 0,
        category: data.category || 'General',
        period: data.period || 'monthly',
        notes: data.notes || '',
      };
    });

    // 6. Investments
    const invCol = collection(db, 'users', userId, 'investmentItems');
    const invSnap = await getDocs(query(invCol, orderBy('name', 'asc')));
    const investmentItems: InvestmentItem[] = invSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      const purchaseDate = data.purchaseDate instanceof Timestamp ? data.purchaseDate.toDate().toISOString() : data.purchaseDate || new Date(0).toISOString();
      return {
        id: docSnap.id,
        userId: userId,
        name: data.name || '',
        type: data.type || 'Stocks',
        amountInvested: Number(data.amountInvested) || 0,
        currentValue: Number(data.currentValue) || 0,
        allocation: Number(data.allocation) || 0,
        returns: Number(data.returns) || 0,
        purchaseDate,
      };
    });

    // 7. Weekly Reviews
    const reviewsCol = collection(db, 'users', userId, 'weeklyReviews');
    const reviewsSnap = await getDocs(reviewsCol);
    const ownedReviews: Record<string, WeeklyReviewData> = {};
    reviewsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      ownedReviews[data.weekKey || docSnap.id] = {
        ownerId: userId,
        ownerUsername: data.ownerUsername || 'Me',
        journal: data.journal || '',
        transactionComments: data.transactionComments || {},
        weekKey: data.weekKey || docSnap.id,
      };
    });

    // 8. Statement Settings
    const settingsRef = doc(db, 'users', userId, 'statementSettings', 'current');
    const settingsSnap = await getDoc(settingsRef);
    const settingsData = settingsSnap.exists() ? settingsSnap.data() : {};

    // 9. Notifications
    const notifCol = collection(db, 'users', userId, 'notifications');
    const notifSnap = await getDocs(query(notifCol, orderBy('timestamp', 'desc'), limit(50)));
    const notifications: NotificationItem[] = notifSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      const ts = data.timestamp instanceof Timestamp ? data.timestamp.toDate().toISOString() : data.timestamp || new Date().toISOString();
      return {
        id: docSnap.id,
        userId: userId,
        userId,
        title: data.title || '',
        message: data.message || '',
        type: data.type || 'info',
        read: !!data.read,
        timestamp: ts,
      };
    });

    return {
      transactions,
      debts,
      assetItems,
      otherLiabilityItems,
      budgetItems,
      investmentItems,
      ownedReviews,
      sharedReviews: {},
      notifications,
      startDate: settingsData.startDate || undefined,
      endDate: settingsData.endDate || undefined,
      gettingStartedDismissed: !!settingsData.gettingStartedDismissed,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
  }
}

/**
 * Saves user financial data to Firestore using atomic batch operations
 */
export async function saveUserDataToFirestore(
  userId: string,
  payload: {
    transactions?: any[];
    deletedTransactions?: string[];
    debts?: any[];
    deletedDebts?: string[];
    assetItems?: any[];
    deletedAssetItems?: string[];
    otherLiabilityItems?: any[];
    deletedOtherLiabilityItems?: string[];
    budgetItems?: any[];
    deletedBudgetItems?: string[];
    investmentItems?: any[];
    deletedInvestmentItems?: string[];
    weeklyReviews?: Record<string, any>;
    deletedWeeklyReviews?: string[];
    startDate?: string | null;
    endDate?: string | null;
    gettingStartedDismissed?: boolean;
  }
): Promise<void> {
  if (!userId) throw new Error('User ID is required');

  // Guest and anonymous sessions store data strictly in offline storage snapshots
  if (isGuestOrLocalUserId(userId)) {
    return;
  }

  // Guard client-side calls when Firebase Auth user is not signed in
  if (typeof window !== 'undefined' && (!auth.currentUser || auth.currentUser.uid !== userId)) {
    console.warn('[Firestore] Client is not authenticated as target user in Firebase Auth. Skipping direct Firestore save.');
    return;
  }

  try {
    const batchList: any[] = [];
    let currentBatch = writeBatch(db);
    let opCount = 0;

    const addOperation = (operationFn: (b: any) => void) => {
      if (opCount >= 400) {
        batchList.push(currentBatch);
        currentBatch = writeBatch(db);
        opCount = 0;
      }
      operationFn(currentBatch);
      opCount++;
    };

    // 1. Transactions - Set
    if (payload.transactions && Array.isArray(payload.transactions)) {
      payload.transactions.forEach((tx) => {
        if (!tx.id) return;
        const txRef = doc(db, 'users', userId, 'transactions', tx.id);
        addOperation((b) => b.set(txRef, {
          ...tx,
          userId,
          amount: Number(tx.amount) || 0,
          updatedAt: new Date().toISOString(),
        }, { merge: true }));
      });
    }

    // 1b. Transactions - Delete
    if (payload.deletedTransactions && Array.isArray(payload.deletedTransactions)) {
      payload.deletedTransactions.forEach((id) => {
        const txRef = doc(db, 'users', userId, 'transactions', id);
        addOperation((b) => b.delete(txRef));
      });
    }

    // 2. Debts - Set
    if (payload.debts && Array.isArray(payload.debts)) {
      payload.debts.forEach((debt) => {
        if (!debt.id) return;
        const debtRef = doc(db, 'users', userId, 'debts', debt.id);
        addOperation((b) => b.set(debtRef, {
          ...debt,
          userId,
          date: debt.date || new Date().toISOString().split('T')[0],
          dueDate: debt.dueDate || null,
          classification: debt.classification === 'institutional' ? 'institutional' : 'personal',
          principal: Number(debt.principal) || 0,
          interestRate: debt.interestRate !== undefined && debt.interestRate !== null ? Number(debt.interestRate) : 0,
          minPayment: Number(debt.minPayment) || 0,
          term: debt.term || 'short',
          status: debt.status || 'active',
          securityType: debt.securityType === 'secured' ? 'secured' : 'unsecured',
          securityDescription: debt.securityDescription || null,
          notes: debt.notes || '',
          updatedAt: new Date().toISOString(),
        }, { merge: true }));
      });
    }

    // 2b. Debts - Delete
    if (payload.deletedDebts && Array.isArray(payload.deletedDebts)) {
      payload.deletedDebts.forEach((id) => {
        const debtRef = doc(db, 'users', userId, 'debts', id);
        addOperation((b) => b.delete(debtRef));
      });
    }

    // 3. Asset Items - Set
    if (payload.assetItems && Array.isArray(payload.assetItems)) {
      payload.assetItems.forEach((asset) => {
        if (!asset.id) return;
        const assetRef = doc(db, 'users', userId, 'assetItems', asset.id);
        addOperation((b) => b.set(assetRef, {
          ...asset,
          userId,
          value: Number(asset.value) || Number(asset.amount) || 0,
          isAsset: true,
          updatedAt: new Date().toISOString(),
        }, { merge: true }));
      });
    }

    // 3b. Asset Items - Delete
    if (payload.deletedAssetItems && Array.isArray(payload.deletedAssetItems)) {
      payload.deletedAssetItems.forEach((id) => {
        const assetRef = doc(db, 'users', userId, 'assetItems', id);
        addOperation((b) => b.delete(assetRef));
      });
    }

    // 4. Other Liabilities - Set
    if (payload.otherLiabilityItems && Array.isArray(payload.otherLiabilityItems)) {
      payload.otherLiabilityItems.forEach((liab) => {
        if (!liab.id) return;
        const liabRef = doc(db, 'users', userId, 'otherLiabilityItems', liab.id);
        addOperation((b) => b.set(liabRef, {
          ...liab,
          userId,
          value: Number(liab.value) || Number(liab.amount) || 0,
          updatedAt: new Date().toISOString(),
        }, { merge: true }));
      });
    }

    // 4b. Other Liabilities - Delete
    if (payload.deletedOtherLiabilityItems && Array.isArray(payload.deletedOtherLiabilityItems)) {
      payload.deletedOtherLiabilityItems.forEach((id) => {
        const liabRef = doc(db, 'users', userId, 'otherLiabilityItems', id);
        addOperation((b) => b.delete(liabRef));
      });
    }

    // 5. Budget Items - Set
    if (payload.budgetItems && Array.isArray(payload.budgetItems)) {
      payload.budgetItems.forEach((item) => {
        if (!item.id) return;
        const bRef = doc(db, 'users', userId, 'budgetItems', item.id);
        addOperation((b) => b.set(bRef, {
          ...item,
          userId,
          budgetedAmount: Number(item.budgetedAmount) || Number(item.amount) || 0,
          actualAmount: Number(item.actualAmount) || 0,
          updatedAt: new Date().toISOString(),
        }, { merge: true }));
      });
    }

    // 5b. Budget Items - Delete
    if (payload.deletedBudgetItems && Array.isArray(payload.deletedBudgetItems)) {
      payload.deletedBudgetItems.forEach((id) => {
        const bRef = doc(db, 'users', userId, 'budgetItems', id);
        addOperation((b) => b.delete(bRef));
      });
    }

    // 6. Investments - Set
    if (payload.investmentItems && Array.isArray(payload.investmentItems)) {
      payload.investmentItems.forEach((inv) => {
        if (!inv.id) return;
        const invRef = doc(db, 'users', userId, 'investmentItems', inv.id);
        addOperation((b) => b.set(invRef, {
          ...inv,
          userId,
          amountInvested: Number(inv.amountInvested) || Number(inv.purchasePrice) * Number(inv.quantity) || 0,
          currentValue: Number(inv.currentValue) || 0,
          allocation: Number(inv.allocation) || 0,
          returns: Number(inv.returns) || 0,
          updatedAt: new Date().toISOString(),
        }, { merge: true }));
      });
    }

    // 6b. Investments - Delete
    if (payload.deletedInvestmentItems && Array.isArray(payload.deletedInvestmentItems)) {
      payload.deletedInvestmentItems.forEach((id) => {
        const invRef = doc(db, 'users', userId, 'investmentItems', id);
        addOperation((b) => b.delete(invRef));
      });
    }

    // 7. Weekly Reviews - Set
    if (payload.weeklyReviews && typeof payload.weeklyReviews === 'object') {
      Object.entries(payload.weeklyReviews).forEach(([weekKey, review]) => {
        const revRef = doc(db, 'users', userId, 'weeklyReviews', weekKey);
        addOperation((b) => b.set(revRef, {
          ...review,
          userId,
          weekKey,
          updatedAt: new Date().toISOString(),
        }, { merge: true }));
      });
    }

    // 7b. Weekly Reviews - Delete
    if (payload.deletedWeeklyReviews && Array.isArray(payload.deletedWeeklyReviews)) {
      payload.deletedWeeklyReviews.forEach((weekKey) => {
        const revRef = doc(db, 'users', userId, 'weeklyReviews', weekKey);
        addOperation((b) => b.delete(revRef));
      });
    }

    // 8. Settings
    if (
      payload.startDate !== undefined ||
      payload.endDate !== undefined ||
      payload.gettingStartedDismissed !== undefined
    ) {
      const settingsRef = doc(db, 'users', userId, 'statementSettings', 'current');
      const settingsUpdate: any = { updatedAt: new Date().toISOString() };
      if (payload.startDate !== undefined) settingsUpdate.startDate = payload.startDate;
      if (payload.endDate !== undefined) settingsUpdate.endDate = payload.endDate;
      if (payload.gettingStartedDismissed !== undefined)
        settingsUpdate.gettingStartedDismissed = payload.gettingStartedDismissed;
      addOperation((b) => b.set(settingsRef, settingsUpdate, { merge: true }));
    }

    if (opCount > 0) {
      batchList.push(currentBatch);
    }

    for (const b of batchList) {
      await b.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
}

/**
 * Diagnostic test entries operations for admin connection tests
 */
export async function createFirestoreTestEntry(userId: string, data: string): Promise<string> {
  const entryId = `test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const entryRef = doc(db, 'users', userId, 'testEntries', entryId);
  try {
    await setDoc(entryRef, {
      id: entryId,
      userId,
      data,
      createdAt: new Date().toISOString(),
    });
    return entryId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/testEntries/${entryId}`);
    throw error;
  }
}

export async function fetchFirestoreTestEntry(userId: string): Promise<{ id: string; data: string; createdAt: Date } | null> {
  const entriesCol = collection(db, 'users', userId, 'testEntries');
  try {
    const snap = await getDocs(query(entriesCol, orderBy('createdAt', 'desc'), limit(1)));
    if (snap.empty) return null;
    const docData = snap.docs[0].data();
    return {
      id: snap.docs[0].id,
      data: docData.data || '',
      createdAt: new Date(docData.createdAt || Date.now()),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}/testEntries`);
    throw error;
  }
}

export async function deleteFirestoreTestEntry(userId: string, entryId: string): Promise<void> {
  const entryRef = doc(db, 'users', userId, 'testEntries', entryId);
  try {
    await deleteDoc(entryRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}/testEntries/${entryId}`);
    throw error;
  }
}

export {
  fetchUserDataFromFirestore as fetchAllUserDataFromFirestore,
  saveUserDataToFirestore as saveAllUserDataToFirestore,
};

