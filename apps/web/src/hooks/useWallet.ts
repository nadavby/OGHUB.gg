'use client';

import { useCallback } from 'react';
import { useAuth } from './useAuth';
import { api, getStoredToken } from '@/lib/api';

interface WalletData {
  balance: string;
  frozenBalance: string;
  currency: string;
}

export function useWallet() {
  const { wallet, walletLoading: loading, refreshWallet } = useAuth();

  const deposit = useCallback(async (amount: number) => {
    const token = getStoredToken();
    if (!token) return;
    const data = await api<WalletData>('/api/wallet/deposit', {
      method: 'POST',
      body: { amount },
      token,
    });
    await refreshWallet();
    return data;
  }, [refreshWallet]);

  return { wallet, loading, deposit, refetch: refreshWallet };
}
