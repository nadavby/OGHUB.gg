'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePayments, RecipientDetails } from '@/hooks/usePayments';
import { useToast } from '@/components/Toast';

interface WithdrawModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  availableBalance: number;
}

const NETWORKS = ['ERC20', 'TRC20', 'SOL', 'BTC'] as const;

export default function WithdrawModal({ open, onClose, onSuccess, availableBalance }: WithdrawModalProps) {
  const { createPayout } = usePayments();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'card' | 'crypto'>('crypto');
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState<typeof NETWORKS[number]>('TRC20');
  const [loading, setLoading] = useState(false);

  const minAmount = tab === 'card' ? 20 : 10;
  const fee = tab === 'card' ? 0.50 : 0;

  const handleWithdraw = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num < minAmount) {
      showToast(`Minimum withdrawal is $${minAmount}`, 'error');
      return;
    }
    if (num > availableBalance) {
      showToast('Insufficient balance', 'error');
      return;
    }
    if (tab === 'crypto' && !address.trim()) {
      showToast('Please enter a wallet address', 'error');
      return;
    }

    setLoading(true);
    try {
      const provider = tab === 'card' ? 'STRIPE' : 'COINBASE';
      const recipient: RecipientDetails = tab === 'card'
        ? { type: 'card_refund' }
        : { type: 'crypto', address: address.trim(), network };

      const result = await createPayout(num, provider, recipient);

      showToast(
        result.status === 'PROCESSING'
          ? `$${num.toFixed(2)} withdrawal processing`
          : `$${num.toFixed(2)} withdrawal submitted for review`,
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Withdrawal failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <div className="modal-handle" />
        <h2 className="modal-title">Withdraw Funds</h2>
        <p className="payment-note" style={{ margin: '0 0 16px', textAlign: 'left' }}>
          Available: <strong>${availableBalance.toFixed(2)}</strong>
        </p>

        {/* Tabs */}
        <div className="payment-tabs">
          <button
            className={`payment-tab ${tab === 'card' ? 'payment-tab-active' : ''}`}
            onClick={() => setTab('card')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            Card
          </button>
          <button
            className={`payment-tab ${tab === 'crypto' ? 'payment-tab-active' : ''}`}
            onClick={() => setTab('crypto')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Crypto
          </button>
        </div>

        {/* Amount */}
        <div className="deposit-row">
          <input
            className="form-input"
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={minAmount}
            step="0.01"
          />
        </div>

        {tab === 'card' && (
          <p className="payment-note">
            Min ${minAmount} &middot; $0.50 fee &middot; Returns to your deposit card
          </p>
        )}

        {tab === 'crypto' && (
          <>
            {/* Network Selector */}
            <div className="network-select">
              {NETWORKS.map((n) => (
                <button
                  key={n}
                  className={`network-btn ${network === n ? 'network-btn-active' : ''}`}
                  onClick={() => setNetwork(n)}
                >
                  {n}
                </button>
              ))}
            </div>

            {/* Wallet Address */}
            <input
              className="form-input"
              type="text"
              placeholder="Wallet address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />

            <p className="payment-note">
              Min ${minAmount} &middot; No fee &middot; Auto-approved under $500
            </p>
          </>
        )}

        {/* Submit */}
        <button
          className="btn-primary btn-full"
          onClick={handleWithdraw}
          disabled={loading || !amount}
        >
          {loading ? 'Processing...' : `Withdraw $${(parseFloat(amount || '0') - fee).toFixed(2)}`}
        </button>

        <p className="payment-note" style={{ marginTop: 12 }}>
          Estimated: 24-48 hours
        </p>
      </motion.div>
    </div>
  );
}
