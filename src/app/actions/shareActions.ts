// src/app/actions/shareActions.ts
import type { UserShareInfo, SharedReviewRecord, CollaboratorComment, ShareScopeType, TransactionWithId, ReviewChatMessage } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where, updateDoc, onSnapshot, orderBy, limit } from 'firebase/firestore';
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

/**
 * Streams chat messages for a specific shared review in real-time.
 */
export function streamReviewChatMessagesApi(
  shareId: string,
  onUpdate: (messages: ReviewChatMessage[]) => void
): () => void {
  // Try local fallback first
  const getLocalChats = (): ReviewChatMessage[] => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(`ifc_review_chats_${shareId}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveLocalChats = (msgs: ReviewChatMessage[]) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`ifc_review_chats_${shareId}`, JSON.stringify(msgs));
    } catch {}
  };

  try {
    const chatRef = collection(db, 'sharedReviews', shareId, 'chats');
    const q = query(chatRef, orderBy('timestamp', 'asc'), limit(150));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages: ReviewChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        messages.push({
          id: docSnap.id,
          ...docSnap.data()
        } as ReviewChatMessage);
      });
      saveLocalChats(messages);
      onUpdate(messages);
    }, (error) => {
      logWarn(`[ShareActions] Firestore chat onSnapshot failed: ${error.message}. Using local storage fallback.`);
      onUpdate(getLocalChats());
    });

    return unsubscribe;
  } catch (error) {
    logWarn(`[ShareActions] Error initializing chat stream: ${error}. Using local storage fallback.`);
    onUpdate(getLocalChats());
    return () => {};
  }
}

/**
 * Sends a chat message in a shared review thread.
 */
export async function sendReviewChatMessageApi(
  shareId: string,
  messageText: string,
  sender: { userId: string; name: string; role: 'owner' | 'reviewer' | 'assistant' }
): Promise<ReviewChatMessage> {
  const cleanMsg = messageText.trim();
  if (!cleanMsg) {
    throw new Error('Message content cannot be empty.');
  }

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const chatMessage: ReviewChatMessage = {
    id: messageId,
    shareId,
    senderId: sender.userId,
    senderName: sender.name,
    senderRole: sender.role,
    message: cleanMsg,
    timestamp: new Date().toISOString()
  };

  // Save to local fallback first
  if (typeof window !== 'undefined') {
    try {
      const key = `ifc_review_chats_${shareId}`;
      const existing = localStorage.getItem(key);
      const msgs = existing ? JSON.parse(existing) : [];
      msgs.push(chatMessage);
      localStorage.setItem(key, JSON.stringify(msgs));
    } catch {}
  }

  // Persist in Firestore sub-collection
  try {
    const docRef = doc(db, 'sharedReviews', shareId, 'chats', messageId);
    await setDoc(docRef, chatMessage);
    logInfo(`[ShareActions] Chat message persisted: ${messageId} on share ${shareId}`);
  } catch (error: any) {
    logWarn(`[ShareActions] Firestore send message fallback: ${error?.message}`);
  }

  return chatMessage;
}

/**
 * Streams AI responses from the Gemini proxy or falls back to client-side.
 */
export async function streamAIAssistantResponse(
  shareId: string,
  userMessage: string,
  chatHistory: ReviewChatMessage[],
  context: any,
  onChunk: (text: string) => void
): Promise<string> {
  let fullText = "";

  try {
    // 1. Try server-side API proxy first
    const response = await fetch("/api/gemini/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMessage,
        chatHistory,
        context,
      }),
    });

    if (response.ok && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        fullText += chunkText;
        onChunk(chunkText);
      }
      return fullText;
    }
  } catch (err) {
    logWarn(`[ShareActions] Server-side Gemini stream failed, trying client-side fallback: ${err}`);
  }

  // 2. Client-side Fallback (extremely resilient for development/SPA standalone mode)
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error("No Gemini API Key available on client-side environment.");
    }

    const ai = new GoogleGenAI({ apiKey });

    const contents = chatHistory.map((h) => ({
      role: h.senderRole === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: h.message }]
    }));

    const contextStr = context 
      ? `\n\n[Weekly Review Context:\n- Period: ${context.periodLabel || 'N/A'}\n- Journal Notes: ${context.journal || 'None'}\n- Transactions Count: ${context.transactionsCount || 0}\n- Comments Count: ${context.commentsCount || 0}]`
      : "";

    contents.push({
      role: "user" as const,
      parts: [{ text: `${userMessage}${contextStr}` }]
    });

    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3.8-flash",
      contents,
      config: {
        systemInstruction: "You are an expert AI Financial Advisor at Imani Financial. Your goal is to guide users through their weekly review, analyze their transaction expenses, highlight savings wins, and provide constructive, highly actionable financial strategy advice in Kenya (currency in KES). Keep responses clear, concise, objective, and empathetic.",
      }
    });

    for await (const chunk of responseStream) {
      const chunkText = chunk.text;
      if (chunkText) {
        fullText += chunkText;
        onChunk(chunkText);
      }
    }
    return fullText;
  } catch (err: any) {
    logError(`[ShareActions] All AI assistant routes failed: ${err?.message}`);
    const errorMessage = "I apologize, but I am unable to connect to the Gemini service right now. Please check your network connection or verify that your GEMINI_API_KEY is properly set up in the Settings.";
    onChunk(errorMessage);
    return errorMessage;
  }
}
