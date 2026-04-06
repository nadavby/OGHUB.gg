'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useWallet, WalletTransaction } from '@/hooks/useWallet';
import { useToast } from '@/components/Toast';
import { api, getStoredToken } from '@/lib/api';
import Link from 'next/link';

interface WalletStats {
  totalDeposited: string;
  totalWon: string;
  totalWithdrawn: string;
}

const TX_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  ENTRY_FEE: 'Entry Fee',
  PRIZE_PAYOUT: 'Prize Won',
  REFUND: 'Refund',
};

export default function WalletPage() {
  const { user } = useAuth();
  const { wallet, deposit, withdraw, fetchTransactions, loading } = useWallet();
  const { showToast } = useToast();

  const [depositAmount, setDepositAmount] = useState('');
  const [depositing, setDepositing] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const [stats, setStats] = useState<WalletStats | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txHasMore, setTxHasMore] = useState(false);
  const [txLoading, setTxLoading] = useState(false);

  const loadTransactions = useCallback(async (page: number, append = false) => {
    setTxLoading(true);
    try {
      const result = await fetchTransactions(page, 20);
      setTransactions(prev => append ? [...prev, ...result.transactions] : result.transactions);
      setTxPage(result.page);
      setTxHasMore(result.hasMore);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setTxLoading(false);
    }
  }, [fetchTransactions]);

  const loadStats = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    try {
      const data = await api<WalletStats>('/api/wallet/stats', { token });
      setStats(data);
    } catch (err) {
      console.error('Failed to load wallet stats:', err);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadTransactions(1);
      loadStats();
    }
  }, [user, loadTransactions, loadStats]);

  if (!user) {
    return (
      <div className="auth-page">
        <div className="empty-state">
          <p>Sign in to manage your wallet</p>
          <Link href="/login?redirect=%2Fwallet" className="btn-primary" style={{ marginTop: 16, display: 'inline-block', padding: '12px 32px' }}>
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
      showToast(`$${amount.toFixed(2)} deposited`, 'success');
      loadTransactions(1);
      loadStats();
    } catch (err: any) {
      showToast(err.message || 'Deposit failed', 'error');
    } finally {
      setDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) return;
    setWithdrawing(true);
    try {
      await withdraw(amount);
      setWithdrawAmount('');
      setShowWithdraw(false);
      showToast(`$${amount.toFixed(2)} withdrawal requested`, 'success');
      loadTransactions(1);
      loadStats();
    } catch (err: any) {
      showToast(err.message || 'Withdrawal failed', 'error');
    } finally {
      setWithdrawing(false);
    }
  };

  const formatTxAmount = (amount: string) => {
    const num = parseFloat(amount);
    return num >= 0 ? `+$${num.toFixed(2)}` : `-$${Math.abs(num).toFixed(2)}`;
  };

  const formatTxDate = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const isPositive = (type: string) => ['DEPOSIT', 'PRIZE_PAYOUT', 'REFUND'].includes(type);

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
          <button className="wallet-btn wallet-btn-withdraw" onClick={() => setShowWithdraw(!showWithdraw)}>
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
          <span className="wallet-stat-value">${stats ? parseFloat(stats.totalDeposited).toFixed(2) : '0.00'}</span>
          <span className="wallet-stat-label">Deposited</span>
        </div>
        <div className="wallet-stat">
          <span className="wallet-stat-value wallet-stat-win">${stats ? parseFloat(stats.totalWon).toFixed(2) : '0.00'}</span>
          <span className="wallet-stat-label">Won</span>
        </div>
        <div className="wallet-stat">
          <span className="wallet-stat-value">${stats ? parseFloat(stats.totalWithdrawn).toFixed(2) : '0.00'}</span>
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

      {/* Withdraw */}
      <AnimatePresence>
        {showWithdraw && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="deposit-section"
          >
            <div className="section-header">
              <h2 className="section-title">Withdraw Funds</h2>
            </div>
            <div className="deposit-row">
              <input
                className="form-input"
                type="number"
                placeholder="Amount"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                min="1"
                step="0.01"
              />
              <button
                className="wallet-btn wallet-btn-withdraw"
                onClick={handleWithdraw}
                disabled={withdrawing}
              >
                {withdrawing ? 'Processing...' : 'Withdraw'}
              </button>
            </div>
            <p className="withdraw-note">Withdrawals may take 1-3 business days to process.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction History */}
      <section>
        <div className="section-header">
          <h2 className="section-title">Transactions</h2>
        </div>
        {transactions.length > 0 ? (
          <div className="transaction-list">
            {transactions.map((tx, i) => (
              <motion.div
                key={tx.id}
                className="transaction-item"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <div className={`transaction-icon ${isPositive(tx.type) ? 'tx-positive' : 'tx-negative'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {isPositive(tx.type)
                      ? <path d="M12 19V5M5 12l7-7 7 7" />
                      : <path d="M12 5v14M5 12l7 7 7-7" />
                    }
                  </svg>
                </div>
                <div className="transaction-info">
                  <div className="transaction-desc">{tx.description || TX_TYPE_LABELS[tx.type] || tx.type}</div>
                  <div className="transaction-date">{formatTxDate(tx.createdAt)}</div>
                </div>
                <div className={`transaction-amount ${isPositive(tx.type) ? 'tx-amount-positive' : 'tx-amount-negative'}`}>
                  {formatTxAmount(tx.amount)}
                </div>
              </motion.div>
            ))}
            {txHasMore && (
              <button
                className="load-more-btn"
                onClick={() => loadTransactions(txPage + 1, true)}
                disabled={txLoading}
              >
                {txLoading ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        ) : txLoading ? (
          <div className="empty-state-inline"><p>Loading transactions...</p></div>
        ) : (
          <div className="empty-state-inline"><p>No transactions yet</p></div>
        )}
      </section>
    </div>
  );
}
