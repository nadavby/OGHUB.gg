'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePayments } from '@/hooks/usePayments';
import { useToast } from '@/components/Toast';

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
}

const CARD_AMOUNTS = [10, 25, 50, 100];
const CRYPTO_AMOUNTS = [5, 25, 50, 100];

export default function DepositModal({ open, onClose }: DepositModalProps) {
  const { createCheckout } = usePayments();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'card' | 'crypto'>('card');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const minAmount = tab === 'card' ? 10 : 5;
  const quickAmounts = tab === 'card' ? CARD_AMOUNTS : CRYPTO_AMOUNTS;

  const handleDeposit = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num < minAmount) {
      showToast(`Minimum deposit is $${minAmount}`, 'error');
      return;
    }

    setLoading(true);
    try {
      const provider = tab === 'card' ? 'STRIPE' : 'COINBASE';
      const result = await createCheckout(num, provider);
      // Redirect to payment page
      window.location.href = result.redirectUrl;
    } catch (err: any) {
      showToast(err.message || 'Failed to create checkout', 'error');
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
        <h2 className="modal-title">Deposit Funds</h2>

        {/* Tabs */}
        <div className="payment-tabs">
          <button
            className={`payment-tab ${tab === 'card' ? 'payment-tab-active' : ''}`}
            onClick={() => { setTab('card'); setAmount(''); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            Card
          </button>
          <button
            className={`payment-tab ${tab === 'crypto' ? 'payment-tab-active' : ''}`}
            onClick={() => { setTab('crypto'); setAmount(''); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Crypto
          </button>
        </div>

        {/* Quick Amounts */}
        <div className="quick-amounts">
          {quickAmounts.map((a) => (
            <button
              key={a}
              className={`quick-amount-btn ${amount === String(a) ? 'quick-amount-active' : ''}`}
              onClick={() => setAmount(String(a))}
            >
              ${a}
            </button>
          ))}
        </div>

        {/* Custom Amount */}
        <div className="deposit-row" style={{ marginTop: 12 }}>
          <input
            className="form-input"
            type="number"
            placeholder="Custom amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={minAmount}
            step="0.01"
          />
        </div>

        <p className="payment-note">
          Min ${minAmount} &middot; {tab === 'card' ? 'No fees' : 'Network fee applies'}
        </p>

        {/* Submit */}
        <button
          className="btn-primary btn-full"
          onClick={handleDeposit}
          disabled={loading || !amount}
        >
          {loading ? 'Redirecting...' : `Deposit $${parseFloat(amount || '0').toFixed(2)}`}
        </button>
      </motion.div>
    </div>
  );
}
