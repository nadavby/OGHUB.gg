'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useWallet, WalletTransaction } from '@/hooks/useWallet';
import { usePayments, PayoutItem, CheckoutStatus } from '@/hooks/usePayments';
import { useToast } from '@/components/Toast';
import { api, getStoredToken } from '@/lib/api';
import DepositModal from '@/components/DepositModal';
import WithdrawModal from '@/components/WithdrawModal';
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
  const { user, refreshWallet } = useAuth();
  const { wallet, fetchTransactions, loading } = useWallet();
  const { getPayouts, pollCheckoutStatus } = usePayments();
  const { showToast } = useToast();
  const searchParams = useSearchParams();

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const [stats, setStats] = useState<WalletStats | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txHasMore, setTxHasMore] = useState(false);
  const [txLoading, setTxLoading] = useState(false);

  const [pendingPayouts, setPendingPayouts] = useState<PayoutItem[]>([]);

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

  const loadPayouts = useCallback(async () => {
    try {
      const payouts = await getPayouts();
      setPendingPayouts(payouts.filter(p =>
        ['PENDING_REVIEW', 'APPROVED', 'PROCESSING'].includes(p.status)
      ));
    } catch (err) {
      console.error('Failed to load payouts:', err);
    }
  }, [getPayouts]);

  const refreshAll = useCallback(() => {
    loadTransactions(1);
    loadStats();
    loadPayouts();
    refreshWallet();
  }, [loadTransactions, loadStats, loadPayouts, refreshWallet]);

  useEffect(() => {
    if (user) refreshAll();
  }, [user, refreshAll]);

  // Handle checkout return URL
  useEffect(() => {
    const checkoutResult = searchParams.get('checkout');
    const sessionId = searchParams.get('session');

    if (checkoutResult === 'success' && sessionId) {
      showToast('Processing deposit...', 'info');
      pollCheckoutStatus(sessionId, (status: CheckoutStatus) => {
        if (status.status === 'COMPLETED') {
          showToast(`$${status.amount} deposited!`, 'success');
          refreshAll();
        } else if (status.status === 'FAILED') {
          showToast('Deposit failed. Please try again.', 'error');
        } else if (status.status === 'EXPIRED') {
          showToast('Deposit expired. Please try again.', 'error');
        }
      });
      // Clean URL
      window.history.replaceState({}, '', '/wallet');
    } else if (checkoutResult === 'cancelled') {
      showToast('Deposit cancelled', 'info');
      window.history.replaceState({}, '', '/wallet');
    }
  }, [searchParams, pollCheckoutStatus, showToast, refreshAll]);

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

  const balance = wallet ? parseFloat(wallet.balance) : 0;
  const frozen = wallet ? parseFloat(wallet.frozenBalance) : 0;
  const available = balance - frozen;

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

  const truncateAddress = (addr: string) =>
    addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

  return (
    <div className="wallet-page">
      <h1 className="page-title">Wallet</h1>

      {/* Balance Card */}
      <motion.div className="wallet-balance-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="wallet-balance-amount">${available.toFixed(2)}</div>
        <div className="wallet-balance-label">
          Available Balance
          {frozen > 0 && <span style={{ color: 'var(--primary)', marginLeft: 8 }}>(${frozen.toFixed(2)} pending)</span>}
        </div>
        <div className="wallet-actions">
          <button className="wallet-btn wallet-btn-deposit" onClick={() => setDepositOpen(true)}>Deposit</button>
          <button className="wallet-btn wallet-btn-withdraw" onClick={() => setWithdrawOpen(true)}>Withdraw</button>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <motion.div className="wallet-stats" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
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

      {/* Pending Withdrawals */}
      {pendingPayouts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="section-header"><h2 className="section-title">Pending Withdrawals</h2></div>
          <div className="payout-pending-list">
            {pendingPayouts.map((p) => (
              <div key={p.id} className="payout-pending-item">
                <div>
                  <span className="payout-pending-amount">${parseFloat(p.amount).toFixed(2)}</span>
                  {p.recipientExternalId && (
                    <span className="payout-pending-dest"> → {truncateAddress(p.recipientExternalId)}</span>
                  )}
                </div>
                <span className="payout-pending-status">{p.status.replace('_', ' ').toLowerCase()}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Transaction History */}
      <section>
        <div className="section-header"><h2 className="section-title">Transactions</h2></div>
        {transactions.length > 0 ? (
          <div className="transaction-list">
            {transactions.map((tx, i) => (
              <motion.div key={tx.id} className="transaction-item" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <div className={`transaction-icon ${isPositive(tx.type) ? 'tx-positive' : 'tx-negative'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {isPositive(tx.type) ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M5 12l7 7 7-7" />}
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
              <button className="load-more-btn" onClick={() => loadTransactions(txPage + 1, true)} disabled={txLoading}>
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

      {/* Modals */}
      <AnimatePresence>
        {depositOpen && <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {withdrawOpen && (
          <WithdrawModal
            open={withdrawOpen}
            onClose={() => setWithdrawOpen(false)}
            onSuccess={refreshAll}
            availableBalance={available}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
