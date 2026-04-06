'use client';

import { motion } from 'framer-motion';

interface Winner {
  userId: string;
  rank: number;
  prize: string;
}

interface Refund {
  userId: string;
  amount: string;
}

interface Props {
  type: 'completed' | 'cancelled';
  winners?: Winner[];
  refunds?: Refund[];
  reason?: string;
  participants: { userId: string; displayName: string }[];
  currentUserId: string;
  onBack: () => void;
}

const RANK_LABELS = ['🏆', '🥈', '🥉'];

export function RoomResults({ type, winners, refunds, reason, participants, currentUserId, onBack }: Props) {
  const getName = (userId: string) =>
    participants.find(p => p.userId === userId)?.displayName || userId;

  if (type === 'cancelled') {
    const myRefund = refunds?.find(r => r.userId === currentUserId);
    return (
      <div className="room-results">
        <h2 className="room-results-title">ROOM CANCELLED</h2>
        {reason && <p className="room-results-reason">{reason}</p>}
        {myRefund && (
          <p className="room-results-refund">Entry fee refunded: +${myRefund.amount}</p>
        )}
        <button className="room-results-btn" onClick={onBack}>Back to Lobby</button>
      </div>
    );
  }

  return (
    <div className="room-results">
      <h2 className="room-results-title">RESULTS</h2>
      <div className="room-results-list">
        {winners?.map((w, i) => (
          <motion.div
            key={w.userId}
            className={`room-results-row ${w.userId === currentUserId ? 'is-you' : ''}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15 }}
          >
            <span className="room-results-rank">{RANK_LABELS[i] || `#${w.rank}`}</span>
            <span className="room-results-name">{getName(w.userId)}</span>
            {parseFloat(w.prize) > 0 && (
              <span className="room-results-prize">+${w.prize}</span>
            )}
          </motion.div>
        ))}
      </div>
      <button className="room-results-btn" onClick={onBack}>Back to Lobby</button>
    </div>
  );
}
