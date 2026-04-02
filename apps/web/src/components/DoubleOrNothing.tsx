'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';

interface DoubleOrNothingProps {
  currentWinnings: number;
  onDouble: () => void;
  onCollect: () => void;
}

export default function DoubleOrNothing({ currentWinnings, onDouble, onCollect }: DoubleOrNothingProps) {
  const [timer, setTimer] = useState(15);
  const [doubledAmount] = useState(currentWinnings * 2);

  useEffect(() => {
    if (timer <= 0) {
      onCollect(); // Auto-collect on timeout
      return;
    }
    const interval = setInterval(() => setTimer(t => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer, onCollect]);

  return (
    <motion.div
      className="don-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="don-card"
        initial={{ scale: 0.8, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
      >
        <div className="don-title">⚡ Double or Nothing</div>
        <div className="don-subtitle">Risk it all for the big win?</div>

        <motion.div
          className="don-amount"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.3 }}
        >
          ${currentWinnings.toFixed(2)}
        </motion.div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Win → <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${doubledAmount.toFixed(2)}</span>
          {' '}or lose it all
        </div>

        <div className="don-buttons">
          <motion.button
            className="don-btn double"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onDouble}
          >
            🎰 DOUBLE IT
          </motion.button>
          <motion.button
            className="don-btn collect"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onCollect}
          >
            💰 Collect
          </motion.button>
        </div>

        <div className="don-timer">
          ⏱ Auto-collect in {timer}s
        </div>
      </motion.div>
    </motion.div>
  );
}
