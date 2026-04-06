'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useRooms, RoomListItem } from '@/hooks/useRooms';
import { api } from '@/lib/api';
import CreateRoomModal from '@/components/CreateRoomModal';

interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
}

interface GameDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  tags: string[];
}

const FORMAT_LABELS: Record<string, string> = {
  ONE_V_ONE: '1v1',
  BEST_OF_3: 'Bo3',
  FFA_5: 'FFA 5',
  FFA_10: 'FFA 10',
  FFA_20: 'FFA 20',
};

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, username: 'xProPlayer', score: 15420 },
  { rank: 2, username: 'GameMaster99', score: 14200 },
  { rank: 3, username: 'SkillKing', score: 13800 },
  { rank: 4, username: 'NoobSlayer', score: 12500 },
  { rank: 5, username: 'ProGamer42', score: 11900 },
];

export default function GameDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, refreshWallet } = useAuth();
  const { listRooms, joinRoom } = useRooms();

  const [game, setGame] = useState<GameDetail | null>(null);
  const [gameLoading, setGameLoading] = useState(true);

  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);

  const gameId = params.id as string;

  // Fetch game detail
  useEffect(() => {
    setGameLoading(true);
    api<GameDetail>(`/api/games/${gameId}`)
      .then((data) => setGame(data))
      .catch(() => {
        // API unavailable — leave game as null; page still renders rooms
      })
      .finally(() => setGameLoading(false));
  }, [gameId]);

  // Fetch rooms (and re-fetch every 30 s)
  const fetchRooms = useCallback(async () => {
    try {
      const result = await listRooms({ gameId, status: 'WAITING' });
      setRooms(result.rooms);
      setRoomsError(null);
    } catch (err: any) {
      setRoomsError(err.message || 'Failed to load rooms');
    } finally {
      setRoomsLoading(false);
    }
  }, [gameId, listRooms]);

  useEffect(() => {
    fetchRooms();
    const timer = setInterval(fetchRooms, 30_000);
    return () => clearInterval(timer);
  }, [fetchRooms]);

  const handleJoin = async (roomId: string) => {
    if (!user) {
      router.push('/login');
      return;
    }
    setJoiningId(roomId);
    setJoinError(null);
    try {
      await joinRoom(roomId);
      await refreshWallet();
      router.push(`/rooms/${roomId}`);
    } catch (err: any) {
      setJoinError(err.message || 'Failed to join room');
      setJoiningId(null);
    }
  };

  const handleCreateClick = () => {
    if (!user) {
      router.push('/login');
      return;
    }
    setCreateOpen(true);
  };

  const handleCreated = (roomId: string) => {
    setCreateOpen(false);
    router.push(`/rooms/${roomId}`);
  };

  const title = game?.title ?? 'Loading…';

  return (
    <div className="game-detail">
      {/* Banner */}
      <motion.div
        className="game-banner"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="game-banner-image">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--text-muted)', opacity: 0.5 }}
          >
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M6 12h4M8 10v4" />
            <circle cx="17" cy="10" r="1" />
            <circle cx="15" cy="12" r="1" />
          </svg>
        </div>
        <h1 className="game-banner-title">{title}</h1>
      </motion.div>

      <div className="game-detail-content">
        {/* Description */}
        {game?.description && (
          <p className="game-description">{game.description}</p>
        )}

        {/* Tags */}
        {game?.tags && game.tags.length > 0 && (
          <div className="game-tags">
            {game.tags.map((tag) => (
              <span key={tag} className="game-tag">{tag}</span>
            ))}
          </div>
        )}

        {/* Open Rooms */}
        <section className="game-section">
          <div className="section-header">
            <h2 className="section-title">Open Rooms</h2>
          </div>

          {joinError && (
            <div className="modal-error">{joinError}</div>
          )}

          {roomsLoading ? (
            <div className="empty-state-inline">
              <p>Loading rooms…</p>
            </div>
          ) : roomsError ? (
            <div className="empty-state-inline">
              <p>{roomsError}</p>
            </div>
          ) : rooms.length === 0 ? (
            <div className="empty-state-inline">
              <p>No open rooms yet — be the first to create one!</p>
            </div>
          ) : (
            <div className="rooms-list">
              {rooms.map((room, i) => {
                const formatLabel = FORMAT_LABELS[room.format] ?? room.format;
                const fillPct = (room.currentPlayers / room.maxPlayers) * 100;
                const isJoining = joiningId === room.id;

                return (
                  <motion.div
                    key={room.id}
                    className="room-card"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <div className="room-card-top">
                      <div className="room-creator">
                        <div className="room-avatar">{room.creator[0].toUpperCase()}</div>
                        <span className="room-username">@{room.creator}</span>
                      </div>
                      <span className="room-format">{formatLabel}</span>
                    </div>

                    <div className="room-card-bottom">
                      <div className="room-money">
                        <span className="room-fee">${room.entryFee}</span>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                        <span className="room-prize">${room.prizePool}</span>
                      </div>
                      <div className="room-spots">
                        <div className="room-spots-bar">
                          <div
                            className="room-spots-fill"
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                        <span className="room-spots-text">
                          {room.currentPlayers}/{room.maxPlayers}
                        </span>
                      </div>
                    </div>

                    <button
                      className="room-join-btn"
                      onClick={() => handleJoin(room.id)}
                      disabled={isJoining}
                    >
                      {isJoining ? 'Joining…' : 'Join'}
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* Create Room Button */}
        <button className="create-room-btn" onClick={handleCreateClick}>
          Create Room
        </button>

        {/* Leaderboard Preview */}
        <section className="game-section">
          <div className="section-header">
            <h2 className="section-title">All-Time Top Players</h2>
            <span className="section-link">See All</span>
          </div>

          <div className="leaderboard-list">
            {MOCK_LEADERBOARD.map((entry, i) => (
              <motion.div
                key={entry.rank}
                className="leaderboard-row"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.04 }}
              >
                <span className={`lb-rank ${entry.rank === 1 ? 'lb-rank-first' : ''}`}>
                  #{entry.rank}
                </span>
                <div className="lb-avatar">{entry.username[0]}</div>
                <span className="lb-name">{entry.username}</span>
                <span className="lb-score">{entry.score.toLocaleString()}</span>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Game Stats Footer */}
        <div className="game-stats-footer">
          1,240 games played &middot; $12,450 paid out &middot; 89 active players
        </div>
      </div>

      {/* Create Room Modal */}
      <CreateRoomModal
        gameId={gameId}
        gameTitle={title}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
