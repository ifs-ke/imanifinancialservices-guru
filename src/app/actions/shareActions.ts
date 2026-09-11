// src/app/actions/shareActions.ts
import type { UserShareInfo, SharedReviewRecord, CollaboratorComment, ShareScopeType, TransactionWithId } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where, updateDoc } from 'firebase/firestore';
import { 
  triggerShareInitiatedNotifications, 
  triggerCommentAddedNotification, 
  triggerShareRevokedNotifications 
} from '@/services/notificationService';
import { logInfo, logWarn, logError } from '@/lib/logger';

const LOCAL_SHARED_REVIEWS_KEY = 'ifc_shared_reviews_catalog';

/**
 * Helper to retrieve local active user ID fallback
 */
function getActiveUserId(): string {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('ifc_active_user');
      if (stored) {
        const user = JSON.parse(stored);
        if (user.id) return user.id;
      }
    } catch {}
  }
  return 'admin-seanwambua-uid';
}

/**
 * Local storage helper to store and load shared review records
 */
function getLocalSharedReviews(): Record<string, SharedReviewRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_SHARED_REVIEWS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalSharedReviews(records: Record<string, SharedReviewRecord>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_SHARED_REVIEWS_KEY, JSON.stringify(records));
  } catch {}
}

/**
 * Known system users catalog for instant collaboration search
 */
const KNOWN_USERS: UserShareInfo[] = [
  {
    userId: 'admin-seanwambua-uid',
    email: 'seanwambua@gmail.com',
    name: 'Sean Wambua (Admin)',
  },
  {
    userId: 'demo-user-alex-uid',
    email: 'demo.member@imanifinancial.com',
    name: 'Alex Morgan (Collaborator)',
  },
  {
    userId: 'user-advisor-jane',
    email: 'jane.advisor@imanifinancial.com',
    name: 'Jane Doe (Financial Advisor)',
  }
];

/**
 * Searches for a user by email in Firestore or internal directory.
 * @param email Email to query
 */
export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  // 1. Check known users
  const matchedKnown = KNOWN_USERS.find(u => u.email.toLowerCase() === normalizedEmail);
  if (matchedKnown) return matchedKnown;

  // 2. Query Firestore users collection
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', normalizedEmail));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const docData = snap.docs[0].data();
      return {
        userId: snap.docs[0].id,
        email: docData.email || normalizedEmail,
        name: docData.name || docData.displayName || normalizedEmail.split('@')[0],
      };
    }
  } catch (err) {
    logWarn(`[ShareActions] Firestore query fallback for email search: ${email}`);
  }

  // 3. Fallback: generate a provisional valid collaborator record so collaboration works smoothly
  return {
    userId: `user-${normalizedEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
    email: normalizedEmail,
    name: normalizedEmail.split('@')[0],
  };
}

/**
 * Shares transactions for a given period (weekly, monthly, or custom period) with a recipient (User 2).
 * Grants comment-only permissions and notifies both User 1 and User 2.
 */
export async function shareTransactionsReviewApi(params: {
  scope: ShareScopeType;
  periodKey: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  targetUser: UserShareInfo;
  ownerUser: { userId: string; email?: string; name?: string };
  transactions: TransactionWithId[];
  journal?: string;
}): Promise<SharedReviewRecord> {
  const {
    scope,
    periodKey,
    periodLabel,
    startDate,
    endDate,
    targetUser,
    ownerUser,
    transactions,
    journal = '',
  } = params;

  const ownerId = ownerUser.userId || getActiveUserId();
  const cleanPeriodKey = periodKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  const shareId = `${scope}_${cleanPeriodKey}_${ownerId}_${targetUser.userId}`;

  // Preserve any existing comments if this review was previously shared
  const localCatalog = getLocalSharedReviews();
  const existingRecord = localCatalog[shareId];
  const existingComments = existingRecord?.comments || {};

  const record: SharedReviewRecord = {
    id: shareId,
    scope,
    periodKey,
    periodLabel,
    startDate,
    endDate,
    ownerUserId: ownerId,
    ownerEmail: ownerUser.email || 'user1@imanifinancial.com',
    ownerName: ownerUser.name || 'User 1 (Owner)',
    sharedWithUserId: targetUser.userId,
    sharedWithEmail: targetUser.email,
    sharedWithName: targetUser.name || targetUser.email,
    permissions: 'comment_only',
    status: 'active',
    transactionsSnapshot: transactions,
    comments: existingComments,
    journal,
    createdAt: new Date().toISOString(),
  };

  // 1. Persist to local catalog
  localCatalog[shareId] = record;
  saveLocalSharedReviews(localCatalog);

  // 2. Persist to Firestore
  try {
    const docRef = doc(db, 'sharedReviews', shareId);
    await setDoc(docRef, record, { merge: true });
    logInfo(`[ShareActions] Shared review persisted to Firestore: ${shareId}`, { ownerId, targetId: targetUser.userId });
  } catch (err: any) {
    logWarn(`[ShareActions] Firestore setDoc fallback for sharedReviews: ${err?.message}`);
  }

  // 3. Emit notification for both users
  triggerShareInitiatedNotifications(
    record.ownerName || record.ownerEmail || 'User 1',
    record.sharedWithName || record.sharedWithEmail || 'Collaborator',
    periodLabel,
    scope
  );

  return record;
}

/**
 * Backward-compatible wrapper for weekly sharing
 */
export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
  const currentUserId = getActiveUserId();
  const targetUser = await searchUserByEmailApi(targetUserId.includes('@') ? targetUserId : `${targetUserId}@imanifinancial.com`) || {
    userId: targetUserId,
    email: `${targetUserId}@imanifinancial.com`,
    name: 'Collaborator',
  };

  await shareTransactionsReviewApi({
    scope: 'week',
    periodKey: weekKey,
    periodLabel: `Week ${weekKey}`,
    startDate: new Date().toISOString(),
    endDate: new Date().toISOString(),
    targetUser,
    ownerUser: { userId: currentUserId, name: 'Sean Wambua' },
    transactions: [],
  });
}

/**
 * Adds a comment by either the owner or the collaborator (User 2) on a transaction in a shared review.
 * Recipient has comment rights only and cannot modify transaction numbers/dates.
 */
export async function addCommentToSharedReviewApi(params: {
  shareId: string;
  transactionId: string;
  txDescription: string;
  comment: string;
  author: {
    userId: string;
    name: string;
    email?: string;
    role: 'owner' | 'reviewer';
  };
}): Promise<CollaboratorComment> {
  const { shareId, transactionId, txDescription, comment, author } = params;

  const newComment: CollaboratorComment = {
    id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    transactionId,
    authorId: author.userId,
    authorName: author.name,
    authorEmail: author.email,
    role: author.role,
    comment: comment.trim(),
    createdAt: new Date().toISOString(),
  };

  // 1. Update local catalog
  const catalog = getLocalSharedReviews();
  const record = catalog[shareId];
  let periodLabel = 'Review';

  if (record) {
    periodLabel = record.periodLabel;
    if (!record.comments) record.comments = {};
    if (!record.comments[transactionId]) record.comments[transactionId] = [];
    record.comments[transactionId].push(newComment);
    saveLocalSharedReviews(catalog);
  }

  // 2. Update Firestore
  try {
    const docRef = doc(db, 'sharedReviews', shareId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as SharedReviewRecord;
      periodLabel = data.periodLabel || periodLabel;
      const comments = data.comments || {};
      if (!comments[transactionId]) comments[transactionId] = [];
      comments[transactionId].push(newComment);
      await updateDoc(docRef, { comments });
    }
  } catch (err: any) {
    logWarn(`[ShareActions] Firestore updateDoc fallback for comment: ${err?.message}`);
  }

  // 3. Trigger notification for the other party
  triggerCommentAddedNotification(
    author.name,
    txDescription,
    periodLabel,
    author.role === 'owner'
  );

  return newComment;
}

/**
 * Revokes a share for a recipient while permanently retaining all comments left by User 2.
 */
export async function revokeShareApi(
  shareIdOrWeekKey: string,
  targetUserId: string,
  meta?: { ownerName?: string; targetUserName?: string; periodLabel?: string }
): Promise<void> {
  const currentUserId = getActiveUserId();
  const catalog = getLocalSharedReviews();

  // Identify matching record either by exact shareId or prefix
  let targetShareId = shareIdOrWeekKey;
  let record = catalog[targetShareId];

  if (!record) {
    const foundEntry = Object.values(catalog).find(
      r => (r.id === shareIdOrWeekKey || r.periodKey === shareIdOrWeekKey) &&
           r.sharedWithUserId === targetUserId &&
           r.ownerUserId === currentUserId
    );
    if (foundEntry) {
      targetShareId = foundEntry.id;
      record = foundEntry;
    }
  }

  const periodLabel = meta?.periodLabel || record?.periodLabel || `Review (${shareIdOrWeekKey})`;
  const ownerName = meta?.ownerName || record?.ownerName || 'Owner';
  const targetUserName = meta?.targetUserName || record?.sharedWithName || record?.sharedWithEmail || 'Collaborator';

  // Mark record as revoked in local store but KEEP ALL COMMENTS INTACT
  if (record) {
    record.status = 'revoked';
    record.revokedAt = new Date().toISOString();
    saveLocalSharedReviews(catalog);
  }

  // Update in Firestore: set status='revoked' and revokedAt (retain comments)
  try {
    const docRef = doc(db, 'sharedReviews', targetShareId);
    await setDoc(docRef, { 
      status: 'revoked', 
      revokedAt: new Date().toISOString() 
    }, { merge: true });
    logInfo(`[ShareActions] Share revoked in Firestore (comments retained): ${targetShareId}`);
  } catch (err: any) {
    logWarn(`[ShareActions] Firestore revoke fallback: ${err?.message}`);
  }

  // Emit notification to both parties confirming comments are retained
  triggerShareRevokedNotifications(ownerName, targetUserName, periodLabel);
}

/**
 * Retrieves all shares created by the owner (both active and revoked)
 */
export async function getSharesCreatedByOwnerApi(ownerUserId: string): Promise<SharedReviewRecord[]> {
  const localCatalog = getLocalSharedReviews();
  const localList = Object.values(localCatalog).filter(r => r.ownerUserId === ownerUserId);

  try {
    const q = query(
      collection(db, 'sharedReviews'),
      where('ownerUserId', '==', ownerUserId)
    );
    const snap = await getDocs(q);
    const remoteList: SharedReviewRecord[] = [];
    snap.forEach(docSnap => {
      remoteList.push(docSnap.data() as SharedReviewRecord);
    });

    // Merge remote and local (remote takes precedence, deduplicated by id)
    const map = new Map<string, SharedReviewRecord>();
    localList.forEach(r => map.set(r.id, r));
    remoteList.forEach(r => map.set(r.id, r));
    return Array.from(map.values());
  } catch {
    return localList;
  }
}

/**
 * Retrieves active reviews shared with a specific user (User 2 / recipient).
 * Filters out any shares that have been revoked by the owner.
 */
export async function getSharedReviewsForRecipientApi(recipientUserId: string): Promise<SharedReviewRecord[]> {
  const localCatalog = getLocalSharedReviews();
  const localActive = Object.values(localCatalog).filter(
    r => r.sharedWithUserId === recipientUserId && r.status !== 'revoked'
  );

  try {
    const q = query(
      collection(db, 'sharedReviews'),
      where('sharedWithUserId', '==', recipientUserId),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    const remoteList: SharedReviewRecord[] = [];
    snap.forEach(docSnap => {
      remoteList.push(docSnap.data() as SharedReviewRecord);
    });

    const map = new Map<string, SharedReviewRecord>();
    localActive.forEach(r => map.set(r.id, r));
    remoteList.forEach(r => map.set(r.id, r));
    return Array.from(map.values());
  } catch {
    return localActive;
  }
}

/**
 * Backward compatible user share list for a weekKey
 */
export async function getSharedWithUsersApi(weekKey: string): Promise<UserShareInfo[]> {
  const currentUserId = getActiveUserId();
  const allShares = await getSharesCreatedByOwnerApi(currentUserId);
  return allShares
    .filter(s => s.periodKey === weekKey && s.status === 'active')
    .map(s => ({
      userId: s.sharedWithUserId,
      email: s.sharedWithEmail || `${s.sharedWithUserId}@imanifinancial.com`,
      name: s.sharedWithName || s.sharedWithEmail,
    }));
}

/**
 * Ensures user record exists in users collection
 */
export async function ensureUserInDb(userId: string, email: string, name?: string | null): Promise<any> {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      id: userId,
      email,
      name: name || email.split('@')[0],
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (_e) {}

  return {
    id: userId,
    email,
    name: name || email.split('@')[0],
  };
}
