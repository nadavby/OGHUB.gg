'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { RoomPlayer } from '@/hooks/useRoomSocket';

interface Props {
  players: RoomPlayer[];
  readyPlayers: string[];
  expiresAt?: number;
  currentUserId: string;
  onReady: () => void;
  isReadying: boolean;
}

export function RoomReadyCheck({ players, readyPlayers, expiresAt, currentUserId, onReady, isReadying }: Props) {
  const [timeLeft, setTimeLeft] = useState(30);
  const isCurrentReady = readyPlayers.includes(currentUserId);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <div className="room-ready-check">
      <motion.div
        className="room-ready-header"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <h2>ALL PLAYERS JOINED!</h2>
        <div className="room-ready-timer">
          {timeLeft > 0 ? `0:${timeLeft.toString().padStart(2, '0')}` : 'Time up'}
        </div>
      </motion.div>

      <div className="room-ready-players">
        {players.map((p, i) => (
          <motion.div
            key={p.userId}
            className={`room-ready-player ${readyPlayers.includes(p.userId) ? 'is-ready' : ''}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <span className="room-ready-indicator">
              {readyPlayers.includes(p.userId) ? '✓' : '○'}
            </span>
            <span className="room-ready-name">{p.displayName}</span>
            {p.userId === currentUserId && <span className="lobby-player-you">You</span>}
            <span className="room-ready-status">
              {readyPlayers.includes(p.userId) ? 'READY' : 'waiting...'}
            </span>
          </motion.div>
        ))}
      </div>

      {!isCurrentReady && (
        <motion.button
          className="room-ready-btn"
          onClick={onReady}
          disabled={isReadying}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {isReadying ? 'Readying...' : '✓ READY'}
        </motion.button>
      )}

      {isCurrentReady && (
        <div className="room-ready-waiting">Waiting for all players...</div>
      )}
    </div>
  );
}
