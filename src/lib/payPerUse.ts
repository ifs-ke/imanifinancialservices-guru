// src/lib/payPerUse.ts
/**
 * @file payPerUse.ts
 * @description Pay-Per-Use billing and usage tracking engine.
 * Computes granular costs based on database operations, storage, and API consumption.
 */

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { logInfo, logWarn, logError } from '@/lib/logger';

export interface PricingRateCard {
  readCostKes: number;       // e.g. 0.02 KES per read
  writeCostKes: number;      // e.g. 0.10 KES per write
  storageMbMonthKes: number; // e.g. 0.50 KES per MB/month
  apiCallCostKes: number;    // e.g. 0.25 KES per sync/API call
  aiForecastCostKes: number; // e.g. 5.00 KES per AI projection
  updatedAt: string;
}

export const DEFAULT_RATE_CARD: PricingRateCard = {
  readCostKes: 0.02,
  writeCostKes: 0.10,
  storageMbMonthKes: 0.50,
  apiCallCostKes: 0.25,
  aiForecastCostKes: 5.00,
  updatedAt: new Date().toISOString(),
};

export type UsageMetricType = 
  | 'read' 
  | 'write' 
  | 'storage_kb' 
  | 'api_call' 
  | 'ai_forecast';

/**
 * Retrieves the active pricing rate card from Firestore config or fallback defaults.
 */
export async function getPricingRateCard(): Promise<PricingRateCard> {
  try {
    const ref = doc(db, 'config', 'pricingRateCard');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return { ...DEFAULT_RATE_CARD, ...snap.data() } as PricingRateCard;
    }
  } catch (err) {
    logWarn('Could not load remote rate card, using defaults', { err });
  }
  return DEFAULT_RATE_CARD;
}

/**
 * Updates the global pricing rate card in Firestore.
 */
export async function updatePricingRateCard(newRates: Partial<PricingRateCard>): Promise<PricingRateCard> {
  const current = await getPricingRateCard();
  const updated: PricingRateCard = {
    ...current,
    ...newRates,
    updatedAt: new Date().toISOString(),
  };

  const ref = doc(db, 'config', 'pricingRateCard');
  await setDoc(ref, updated, { merge: true });
  logInfo('Pricing rate card updated', updated);
  return updated;
}

/**
 * Calculates itemized costs from user metrics and the rate card.
 */
export function calculateUsageCost(
  metrics: {
    totalReads?: number;
    totalWrites?: number;
    totalStorageKb?: number;
    totalApiCalls?: number;
    totalAiForecasts?: number;
  },
  rateCard: PricingRateCard = DEFAULT_RATE_CARD
) {
  const reads = metrics.totalReads || 0;
  const writes = metrics.totalWrites || 0;
  const storageKb = metrics.totalStorageKb || 0;
  const storageMb = storageKb / 1024;
  const apiCalls = metrics.totalApiCalls || 0;
  const aiForecasts = metrics.totalAiForecasts || 0;

  const readCost = reads * rateCard.readCostKes;
  const writeCost = writes * rateCard.writeCostKes;
  const storageCost = storageMb * rateCard.storageMbMonthKes;
  const apiCost = apiCalls * rateCard.apiCallCostKes;
  const aiCost = aiForecasts * rateCard.aiForecastCostKes;

  const totalCostKes = readCost + writeCost + storageCost + apiCost + aiCost;

  return {
    totalCostKes: Math.round(totalCostKes * 100) / 100,
    breakdown: {
      readCost: Math.round(readCost * 100) / 100,
      writeCost: Math.round(writeCost * 100) / 100,
      storageCost: Math.round(storageCost * 100) / 100,
      apiCost: Math.round(apiCost * 100) / 100,
      aiCost: Math.round(aiCost * 100) / 100,
    },
  };
}

/**
 * Tracks a user usage event and incrementally computes costs.
 */
export async function trackUserUsage(
  userId: string,
  metric: UsageMetricType,
  quantity = 1
): Promise<void> {
  if (!userId) return;

  try {
    const rateCard = await getPricingRateCard();
    let unitCost = 0;
    const updatePayload: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    switch (metric) {
      case 'read':
        updatePayload.totalReads = increment(quantity);
        unitCost = rateCard.readCostKes * quantity;
        break;
      case 'write':
        updatePayload.totalWrites = increment(quantity);
        unitCost = rateCard.writeCostKes * quantity;
        break;
      case 'storage_kb':
        updatePayload.totalStorageKb = increment(quantity);
        unitCost = (quantity / 1024) * rateCard.storageMbMonthKes;
        break;
      case 'api_call':
        updatePayload.totalApiCalls = increment(quantity);
        unitCost = rateCard.apiCallCostKes * quantity;
        break;
      case 'ai_forecast':
        updatePayload.totalAiForecasts = increment(quantity);
        unitCost = rateCard.aiForecastCostKes * quantity;
        break;
    }

    if (unitCost > 0) {
      updatePayload.incurredCostKes = increment(unitCost);
    }

    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, updatePayload);
  } catch (error) {
    // Non-blocking telemetry tracking
    logWarn(`Failed to track usage metric for ${userId}`, { metric, quantity, error });
  }
}

/**
 * Resets a user's billing cycle counters.
 */
export async function resetUserBillingCycle(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    totalReads: 0,
    totalWrites: 0,
    totalApiCalls: 0,
    totalAiForecasts: 0,
    incurredCostKes: 0,
    lastBilledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  logInfo(`Reset billing cycle for user ${userId}`);
}
