'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface RewardAnimationProps {
  score: number;
  rank: number | null;
  reward?: string;
  isWin?: boolean;
  onClose: () => void;
}

export default function RewardAnimation({ score, rank, reward, isWin = true, onClose }: RewardAnimationProps) {
  const [particles, setParticles] = useState<{ id: number; x: number; emoji: string }[]>([]);

  useEffect(() => {
    // Spawn coin particles
    const newParticles = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 400),
      emoji: ['🪙', '⭐', '✨', '💎'][Math.floor(Math.random() * 4)],
    }));
    setParticles(newParticles);

    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        className="reward-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        {/* Floating particles */}
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="coin-particle"
            style={{ left: p.x }}
            initial={{ y: typeof window !== 'undefined' ? window.innerHeight : 800, opacity: 1, scale: 1 }}
            animate={{ y: -100, opacity: 0, scale: 0.5 }}
            transition={{ duration: 1.5 + Math.random(), delay: Math.random() * 0.5 }}
          >
            {p.emoji}
          </motion.span>
        ))}

        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.2 }}
        >
          <div className="reward-amount">{score.toLocaleString()}</div>
          <div className="reward-label">Points Scored!</div>
        </motion.div>

        {rank && (
          <motion.div
            className="rank-badge"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            Rank #{rank}
          </motion.div>
        )}

        {reward && (
          <motion.div
            style={{ marginTop: 16, color: 'var(--success)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            +${reward} Won!
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
