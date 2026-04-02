'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import Link from 'next/link';

export default function WalletPage() {
  const { user } = useAuth();
  const { wallet, deposit, loading } = useWallet();
  const [depositAmount, setDepositAmount] = useState('');
  const [depositing, setDepositing] = useState(false);

  if (!user) {
    return (
      <div className="auth-page">
        <div className="empty-state">
          <span className="icon">🔒</span>
          <p>Sign in to manage your wallet</p>
          <Link href="/login" className="btn-primary" style={{ marginTop: 16, display: 'inline-block', padding: '12px 32px' }}>
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) return;
    setDepositing(true);
    try {
      await deposit(amount);
      setDepositAmount('');
    } catch (err) {
      console.error(err);
    } finally {
      setDepositing(false);
    }
  };

  const transactions = [
    { type: 'DEPOSIT', amount: '+50.00', desc: 'Wallet deposit', date: 'Today', icon: '💳', positive: true },
    { type: 'ENTRY_FEE', amount: '-2.00', desc: 'Stack Tower entry', date: 'Today', icon: '🎮', positive: false },
    { type: 'PRIZE', amount: '+15.00', desc: 'Challenge winner!', date: 'Yesterday', icon: '🏆', positive: true },
    { type: 'ENTRY_FEE', amount: '-5.00', desc: 'Rhythm Dash entry', date: 'Yesterday', icon: '🎮', positive: false },
    { type: 'DEPOSIT', amount: '+100.00', desc: 'Wallet deposit', date: '3 days ago', icon: '💳', positive: true },
  ];

  return (
    <div className="wallet-page">
      <h1 className="page-title">Wallet</h1>

      <motion.div
        className="wallet-balance-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="wallet-balance-amount">
          ${wallet ? parseFloat(wallet.balance).toFixed(2) : '0.00'}
        </div>
        <div className="wallet-balance-label">Available Balance</div>
      </motion.div>

      {/* Deposit */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{ marginBottom: 24 }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-input"
            type="number"
            placeholder="Amount"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}
            min="1"
            step="0.01"
          />
          <button
            className="wallet-action-btn primary"
            onClick={handleDeposit}
            disabled={depositing}
            style={{ whiteSpace: 'nowrap', padding: '12px 24px' }}
          >
            {depositing ? '⏳' : '💰 Deposit'}
          </button>
        </div>

        {/* Quick amounts */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {[10, 25, 50, 100].map(amount => (
            <button
              key={amount}
              className="tag"
              style={{ flex: 1, textAlign: 'center', cursor: 'pointer', padding: '8px' }}
              onClick={() => setDepositAmount(amount.toString())}
            >
              ${amount}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Transaction History */}
      <h2 className="section-title" style={{ marginBottom: 12 }}>Transaction History</h2>
      <div className="transaction-list">
        {transactions.map((tx, i) => (
          <motion.div
            key={i}
            className="transaction-item"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.05 }}
          >
            <div className={`transaction-icon ${tx.positive ? 'deposit' : 'fee'}`}>
              {tx.icon}
            </div>
            <div className="transaction-info">
              <div className="transaction-type">{tx.desc}</div>
              <div className="transaction-date">{tx.date}</div>
            </div>
            <div className={`transaction-amount ${tx.positive ? 'positive' : 'negative'}`}>
              {tx.amount}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
