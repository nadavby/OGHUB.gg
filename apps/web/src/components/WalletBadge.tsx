'use client';

import Link from 'next/link';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/hooks/useAuth';

export default function WalletBadge() {
  const { user } = useAuth();
  const { wallet } = useWallet();

  if (!user) {
    return (
      <Link href="/login" className="wallet-badge">
        Sign In
      </Link>
    );
  }

  return (
    <Link href="/wallet" className="wallet-badge">
      <span className="wallet-amount">${wallet ? parseFloat(wallet.balance).toFixed(2) : '0.00'}</span>
    </Link>
  );
}
