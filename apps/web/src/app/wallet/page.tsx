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
    { type: 'deposit', amount: '+$50.00', desc: 'Wallet deposit', date: 'Today', positive: true },
    { type: 'entry', amount: '-$2.00', desc: 'Neon Runner entry', date: 'Today', positive: false },
    { type: 'prize', amount: '+$15.00', desc: 'Room winner', date: 'Yesterday', positive: true },
    { type: 'entry', amount: '-$5.00', desc: 'Rhythm Dash entry', date: 'Yesterday', positive: false },
    { type: 'deposit', amount: '+$100.00', desc: 'Wallet deposit', date: '3 days ago', positive: true },
  ];

  const txIcons: Record<string, React.ReactNode> = {
    deposit: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    ),
    entry: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    ),
    prize: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    ),
    withdrawal: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    ),
  };

  return (
    <div className="wallet-page">
      <h1 className="page-title">Wallet</h1>

      {/* Balance Card */}
      <motion.div
        className="wallet-balance-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="wallet-balance-amount">
          ${wallet ? parseFloat(wallet.balance).toFixed(2) : '0.00'}
        </div>
        <div className="wallet-balance-label">Available Balance</div>

        <div className="wallet-actions">
          <button className="wallet-btn wallet-btn-deposit" onClick={() => document.getElementById('deposit-input')?.focus()}>
            Deposit
          </button>
          <button className="wallet-btn wallet-btn-withdraw">
            Withdraw
          </button>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        className="wallet-stats"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="wallet-stat">
          <span className="wallet-stat-value">$250.00</span>
          <span className="wallet-stat-label">Deposited</span>
        </div>
        <div className="wallet-stat">
          <span className="wallet-stat-value wallet-stat-win">$145.00</span>
          <span className="wallet-stat-label">Won</span>
        </div>
        <div className="wallet-stat">
          <span className="wallet-stat-value">$50.00</span>
          <span className="wallet-stat-label">Withdrawn</span>
        </div>
      </motion.div>

      {/* Deposit */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="deposit-section"
      >
        <div className="deposit-row">
          <input
            id="deposit-input"
            className="form-input"
            type="number"
            placeholder="Amount"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            min="1"
            step="0.01"
          />
          <button
            className="wallet-btn wallet-btn-deposit"
            onClick={handleDeposit}
            disabled={depositing}
          >
            {depositing ? 'Processing...' : 'Deposit'}
          </button>
        </div>

        <div className="quick-amounts">
          {[10, 25, 50, 100].map(amount => (
            <button
              key={amount}
              className="quick-amount-btn"
              onClick={() => setDepositAmount(amount.toString())}
            >
              ${amount}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Transaction History */}
      <section>
        <div className="section-header">
          <h2 className="section-title">Transactions</h2>
        </div>
        <div className="transaction-list">
          {transactions.map((tx, i) => (
            <motion.div
              key={i}
              className="transaction-item"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.03 }}
            >
              <div className={`transaction-icon ${tx.positive ? 'tx-positive' : 'tx-negative'}`}>
                {txIcons[tx.type]}
              </div>
              <div className="transaction-info">
                <div className="transaction-desc">{tx.desc}</div>
                <div className="transaction-date">{tx.date}</div>
              </div>
              <div className={`transaction-amount ${tx.positive ? 'tx-amount-positive' : 'tx-amount-negative'}`}>
                {tx.amount}
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
