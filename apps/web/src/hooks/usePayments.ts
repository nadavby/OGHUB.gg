'use client';

import { useCallback } from 'react';
import { api, getStoredToken } from '@/lib/api';

export interface CheckoutResult {
  sessionId: string;
  redirectUrl: string;
}

export interface CheckoutStatus {
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  amount?: string;
}

export interface PayoutResult {
  payoutId: string;
  status: string;
  estimatedTime: string;
}

export interface PayoutItem {
  id: string;
  provider: string;
  amount: string;
  status: string;
  recipientExternalId: string | null;
  createdAt: string;
}

export type RecipientDetails =
  | { type: 'card_refund' }
  | { type: 'bank'; holderName: string; routingNumber: string; accountNumber: string }
  | { type: 'crypto'; address: string; network: 'ERC20' | 'TRC20' | 'SOL' | 'BTC' };

export function usePayments() {
  const createCheckout = useCallback(async (
    amount: number,
    provider: 'STRIPE' | 'COINBASE',
  ): Promise<CheckoutResult> => {
    const token = getStoredToken();
    if (!token) throw new Error('Not authenticated');
    return api<CheckoutResult>('/api/payments/checkout', {
      method: 'POST',
      body: { amount, provider },
      token,
    });
  }, []);

  const getCheckoutStatus = useCallback(async (sessionId: string): Promise<CheckoutStatus> => {
    const token = getStoredToken();
    if (!token) throw new Error('Not authenticated');
    return api<CheckoutStatus>(`/api/payments/checkout/${sessionId}/status`, { token });
  }, []);

  const createPayout = useCallback(async (
    amount: number,
    provider: 'STRIPE' | 'COINBASE',
    recipient: RecipientDetails,
  ): Promise<PayoutResult> => {
    const token = getStoredToken();
    if (!token) throw new Error('Not authenticated');
    return api<PayoutResult>('/api/payments/payout', {
      method: 'POST',
      body: { amount, provider, recipient },
      token,
    });
  }, []);

  const getPayouts = useCallback(async (): Promise<PayoutItem[]> => {
    const token = getStoredToken();
    if (!token) throw new Error('Not authenticated');
    return api<PayoutItem[]>('/api/payments/payouts', { token });
  }, []);

  const pollCheckoutStatus = useCallback(async (
    sessionId: string,
    onComplete: (status: CheckoutStatus) => void,
    maxAttempts = 30,
  ): Promise<void> => {
    let attempts = 0;
    const poll = async () => {
      if (attempts >= maxAttempts) {
        onComplete({ status: 'EXPIRED' });
        return;
      }
      attempts++;
      try {
        const status = await getCheckoutStatus(sessionId);
        if (status.status !== 'PENDING') {
          onComplete(status);
          return;
        }
      } catch {
        // ignore polling errors
      }
      setTimeout(poll, 2000);
    };
    poll();
  }, [getCheckoutStatus]);

  return { createCheckout, getCheckoutStatus, pollCheckoutStatus, createPayout, getPayouts };
}
