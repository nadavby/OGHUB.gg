'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { api, getStoredToken, setStoredToken, clearStoredToken } from '@/lib/api';

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}

interface WalletData {
  balance: string;
  frozenBalance: string;
  currency: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  wallet: WalletData | null;
  walletLoading: boolean;
  refreshWallet: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (data: { displayName?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

  const fetchWallet = useCallback(async (authToken?: string) => {
    const t = authToken || getStoredToken();
    if (!t) {
      setWalletLoading(false);
      return;
    }
    try {
      setWalletLoading(true);
      const data = await api<WalletData>('/api/wallet/balance', { token: t });
      setWallet(data);
    } catch (err) {
      console.error('Failed to fetch wallet:', err);
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const refreshWallet = useCallback(async () => {
    await fetchWallet();
  }, [fetchWallet]);

  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      setToken(stored);
      Promise.all([
        api('/api/auth/me', { token: stored }).then(setUser).catch(() => clearStoredToken()),
        fetchWallet(stored),
      ]).finally(() => setLoading(false));
    } else {
      setLoading(false);
      setWalletLoading(false);
    }
  }, [fetchWallet]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    await fetchWallet(data.token);
  }, [fetchWallet]);

  const register = useCallback(async (email: string, username: string, password: string) => {
    const data = await api<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: { email, username, password },
    });
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    await fetchWallet(data.token);
  }, [fetchWallet]);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
    setWallet(null);
  }, []);

  const updateProfile = useCallback(async (data: { displayName?: string }) => {
    const t = getStoredToken();
    if (!t) throw new Error('Not authenticated');
    const updated = await api<User>('/api/auth/me', { method: 'PATCH', body: data, token: t });
    setUser(updated);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, wallet, walletLoading, refreshWallet, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
