'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useRooms, RoomDetail } from '@/hooks/useRooms';

const FORMAT_LABELS: Record<string, string> = {
  ONE_V_ONE: '1v1',
  BEST_OF_3: 'Best of 3',
  FFA_5: 'FFA - 5 Players',
  FFA_10: 'FFA - 10 Players',
  FFA_20: 'FFA - 20 Players',
};

const STATUS_CLASS: Record<string, string> = {
  WAITING: 'lobby-status-waiting',
  READY: 'lobby-status-ready',
  IN_PROGRESS: 'lobby-status-in-progress',
  COMPLETED: 'lobby-status-completed',
  EXPIRED: 'lobby-status-completed',
  CANCELLED: 'lobby-status-completed',
};

function formatTimeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')} remaining`;
}

export default function RoomLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const { user, refreshWallet } = useAuth();
  const { getRoom, cancelRoom } = useRooms();

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState('');

  const roomId = params.id as string;

  const fetchRoom = useCallback(async () => {
    try {
      const data = await getRoom(roomId);
      setRoom(data);
    } catch (err: any) {
      setError(err.message || 'Room not found');
    } finally {
      setLoading(false);
    }
  }, [roomId, getRoom]);

  // Poll for room updates every 5 seconds
  useEffect(() => {
    fetchRoom();
    const interval = setInterval(fetchRoom, 5000);
    return () => clearInterval(interval);
  }, [fetchRoom]);

  // Timer countdown every second for WAITING rooms
  useEffect(() => {
    if (!room || room.status !== 'WAITING') return;
    const tick = () => setTimeLeft(formatTimeLeft(room.expiresAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [room]);

  const handleCancel = async () => {
    setCancelling(true);
    setError(null);
    try {
      await cancelRoom(roomId);
      await refreshWallet();
      router.push(`/games/${room?.gameSlug || room?.gameId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to cancel room');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return <div className="empty-state"><p>Loading room...</p></div>;
  }

  if (!room) {
    return <div className="empty-state"><p>{error || 'Room not found'}</p></div>;
  }

  const isCreator = user?.id === room.createdByUserId;
  const canCancel = isCreator && room.status === 'WAITING' && room.participants.length <= 1;
  const emptySlots = room.maxPlayers - room.participants.length;

  return (
    <div className="lobby-page">
      <motion.div
        className="lobby-status-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="lobby-game-title">{room.gameTitle}</div>
        <div className="lobby-format">{FORMAT_LABELS[room.format] || room.format}</div>
        <div className="lobby-prize">${room.prizePool} Prize Pool</div>
        <span className={`lobby-status-badge ${STATUS_CLASS[room.status] || ''}`}>
          {room.status.replace('_', ' ')}
        </span>
      </motion.div>

      {room.status === 'WAITING' && (
        <div className="lobby-timer">{timeLeft}</div>
      )}

      {error && <div className="modal-error" style={{ marginBottom: 'var(--space-md)' }}>{error}</div>}

      <section className="lobby-players-section">
        <div className="lobby-players-header">
          <h2 className="section-title">Players</h2>
          <span className="room-spots-text">{room.participants.length}/{room.maxPlayers}</span>
        </div>

        {room.participants.map((p, i) => (
          <motion.div
            key={p.userId}
            className="lobby-player-row"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="lobby-player-avatar">{p.username[0].toUpperCase()}</div>
            <span className="lobby-player-name">{p.username}</span>
            {p.userId === user?.id && <span className="lobby-player-you">You</span>}
          </motion.div>
        ))}

        {Array.from({ length: emptySlots }).map((_, i) => (
          <div key={`empty-${i}`} className="lobby-empty-slot">
            <div className="lobby-player-avatar" style={{ opacity: 0.3 }}>?</div>
            <span>Waiting for player...</span>
          </div>
        ))}
      </section>

      {canCancel && (
        <button
          className="lobby-cancel-btn"
          onClick={handleCancel}
          disabled={cancelling}
        >
          {cancelling ? 'Cancelling...' : 'Cancel Room'}
        </button>
      )}
    </div>
  );
}
