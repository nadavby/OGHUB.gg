'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, getStoredToken } from '@/lib/api';

interface WalletData {
  balance: string;
  frozenBalance: string;
  currency: string;
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWallet = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const data = await api<WalletData>('/api/wallet/balance', { token });
      setWallet(data);
    } catch (err) {
      console.error('Failed to fetch wallet:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const deposit = useCallback(async (amount: number) => {
    const token = getStoredToken();
    if (!token) return;

    const data = await api<WalletData>('/api/wallet/deposit', {
      method: 'POST',
      body: { amount },
      token,
    });
    setWallet(data);
    return data;
  }, []);

  return { wallet, loading, deposit, refetch: fetchWallet };
}
