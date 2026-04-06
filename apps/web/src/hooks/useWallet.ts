'use client';

import { useCallback } from 'react';
import { useAuth } from './useAuth';
import { api, getStoredToken } from '@/lib/api';

interface WalletData {
  balance: string;
  frozenBalance: string;
  currency: string;
}

export interface WalletTransaction {
  id: string;
  type: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  description: string;
  createdAt: string;
}

export interface TransactionListResult {
  transactions: WalletTransaction[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
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

  const withdraw = useCallback(async (amount: number) => {
    const token = getStoredToken();
    if (!token) return;
    const data = await api<WalletData & { message: string }>('/api/wallet/withdraw', {
      method: 'POST',
      body: { amount },
      token,
    });
    await refreshWallet();
    return data;
  }, [refreshWallet]);

  const fetchTransactions = useCallback(async (page = 1, limit = 20): Promise<TransactionListResult> => {
    const token = getStoredToken();
    if (!token) throw new Error('Not authenticated');

    const url = `/api/wallet/transactions?page=${page}&limit=${limit}`;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    const res = await fetch(`${API_URL}${url}`, { method: 'GET', headers });
    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.error || `Request failed: ${res.status}`);
    }

    return {
      transactions: json.data as WalletTransaction[],
      total: json.total,
      page: json.page,
      limit: json.limit,
      hasMore: json.hasMore,
    };
  }, []);

  return { wallet, loading, deposit, withdraw, fetchTransactions, refetch: refreshWallet };
}
