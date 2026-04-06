'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useRooms, RoomDetail } from '@/hooks/useRooms';
import { useRoomSocket, RoomEvent } from '@/hooks/useRoomSocket';
import { useToast } from '@/components/Toast';
import { RoomReadyCheck } from '@/components/RoomReadyCheck';
import { RoomCountdown } from '@/components/RoomCountdown';
import { RoomSettling } from '@/components/RoomSettling';
import { RoomResults } from '@/components/RoomResults';

const FORMAT_LABELS: Record<string, string> = {
  ONE_V_ONE: '1v1',
  BEST_OF_3: 'Best of 3',
  FFA_5: 'FFA - 5 Players',
  FFA_10: 'FFA - 10 Players',
  FFA_20: 'FFA - 20 Players',
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
  const { getRoom, cancelRoom, readyRoom } = useRooms();
  const { showToast } = useToast();

  const roomId = params.id as string;

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [readying, setReadying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [resultEvent, setResultEvent] = useState<RoomEvent | null>(null);
  const [readyCheckExpiry, setReadyCheckExpiry] = useState<number | undefined>();
  const [gameLaunchData, setGameLaunchData] = useState<any>(null);

  // Fetch room data initially
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

  useEffect(() => { fetchRoom(); }, [fetchRoom]);

  // WebSocket connection
  const handleEvent = useCallback((event: RoomEvent) => {
    switch (event.type) {
      case 'ready_check_started':
        setReadyCheckExpiry(event.expiresAt);
        break;
      case 'game_launching':
        setGameLaunchData(event);
        // Open game via deep link
        if (event.deepLinkScheme && user?.id && event.sessions?.[user.id]) {
          const { token, seed } = event.sessions[user.id];
          window.open(`${event.deepLinkScheme}://play?token=${token}&seed=${seed}&roomId=${roomId}`, '_blank');
        }
        break;
      case 'room_completed':
      case 'room_cancelled':
      case 'ready_check_failed':
        setResultEvent(event);
        if (event.type !== 'room_completed') {
          refreshWallet();
        }
        break;
      case 'player_finished':
        showToast(`Player finished with score ${event.score}`, 'info');
        break;
    }
  }, [roomId, user, refreshWallet, showToast]);

  const { roomState, connected } = useRoomSocket({ roomId, onEvent: handleEvent });

  // Timer for WAITING rooms
  useEffect(() => {
    if (!room || room.status !== 'WAITING') return;
    const tick = () => setTimeLeft(formatTimeLeft(room.expiresAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [room]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelRoom(roomId);
      await refreshWallet();
      showToast('Room cancelled — entry fee refunded', 'success');
      router.push('/');
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const handleReady = async () => {
    setReadying(true);
    try {
      await readyRoom(roomId);
    } catch (err: any) {
      showToast(err.message || 'Failed to ready up', 'error');
    } finally {
      setReadying(false);
    }
  };

  if (loading) return <div className="empty-state"><p>Loading room...</p></div>;
  if (!room) return <div className="empty-state"><p>{error || 'Room not found'}</p></div>;

  const status = roomState?.status || room.status;
  const players = roomState?.players || room.participants.map(p => ({
    userId: p.userId,
    displayName: p.username,
  }));
  const readyPlayers = roomState?.readyPlayers || [];

  const isCreator = user?.id === room.createdByUserId;
  const canCancel = isCreator && status === 'WAITING' && room.participants.length <= 1;

  // ─── RENDER BY STATE ──────────────────────────────────

  // Results / Cancelled
  if (resultEvent) {
    return (
      <div className="lobby-page">
        <RoomResults
          type={resultEvent.type === 'room_completed' ? 'completed' : 'cancelled'}
          winners={resultEvent.winners}
          refunds={resultEvent.refunds}
          reason={resultEvent.reason}
          participants={players}
          currentUserId={user?.id || ''}
          onBack={() => router.push('/')}
        />
      </div>
    );
  }

  // Settling
  if (status === 'SETTLING') {
    return (
      <div className="lobby-page">
        <RoomSettling />
      </div>
    );
  }

  // Countdown
  if (status === 'COUNTDOWN' && roomState?.launchAt) {
    return (
      <div className="lobby-page">
        <RoomCountdown launchAt={roomState.launchAt} />
      </div>
    );
  }

  // Ready Check
  if (status === 'READY_CHECK' || status === 'FULL') {
    return (
      <div className="lobby-page">
        <motion.div className="lobby-status-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="lobby-game-title">{room.gameTitle}</div>
          <div className="lobby-format">{FORMAT_LABELS[room.format] || room.format}</div>
          <div className="lobby-prize">${room.prizePool} Prize Pool</div>
        </motion.div>
        <RoomReadyCheck
          players={players}
          readyPlayers={readyPlayers}
          expiresAt={readyCheckExpiry}
          currentUserId={user?.id || ''}
          onReady={handleReady}
          isReadying={readying}
        />
      </div>
    );
  }

  // In Progress
  if (status === 'IN_PROGRESS') {
    return (
      <div className="lobby-page">
        <motion.div className="lobby-status-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="lobby-game-title">{room.gameTitle}</div>
          <span className="lobby-status-badge lobby-status-in-progress">IN PROGRESS</span>
        </motion.div>
        <div className="room-in-progress">
          <p>Game in progress</p>
          {gameLaunchData && user?.id && gameLaunchData.sessions?.[user.id] && (
            <button
              className="room-rejoin-btn"
              onClick={() => {
                const { token, seed } = gameLaunchData.sessions[user.id];
                window.open(`${gameLaunchData.deepLinkScheme}://play?token=${token}&seed=${seed}&roomId=${roomId}`, '_blank');
              }}
            >
              Rejoin Game
            </button>
          )}
        </div>
      </div>
    );
  }

  // WAITING (default)
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
        <span className="lobby-status-badge lobby-status-waiting">WAITING</span>
      </motion.div>

      {status === 'WAITING' && <div className="lobby-timer">{timeLeft}</div>}

      {!connected && <div className="room-connection-status">Connecting...</div>}

      <section className="lobby-players-section">
        <div className="lobby-players-header">
          <h2 className="section-title">Players</h2>
          <span className="room-spots-text">{players.length}/{room.maxPlayers}</span>
        </div>

        {players.map((p, i) => (
          <motion.div
            key={p.userId}
            className="lobby-player-row"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="lobby-player-avatar">{p.displayName[0]?.toUpperCase()}</div>
            <span className="lobby-player-name">{p.displayName}</span>
            {p.userId === user?.id && <span className="lobby-player-you">You</span>}
          </motion.div>
        ))}

        {Array.from({ length: room.maxPlayers - players.length }).map((_, i) => (
          <div key={`empty-${i}`} className="lobby-empty-slot">
            <div className="lobby-player-avatar" style={{ opacity: 0.3 }}>?</div>
            <span>Waiting for player...</span>
          </div>
        ))}
      </section>

      {canCancel && (
        <button className="lobby-cancel-btn" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? 'Cancelling...' : 'Cancel Room'}
        </button>
      )}
    </div>
  );
}
